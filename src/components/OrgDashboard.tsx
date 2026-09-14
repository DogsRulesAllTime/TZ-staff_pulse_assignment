import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { defaultExpandedIds, type Forest } from '@/domain/tree';
import { matchesFilter, nodeMatchesFilter } from '@/domain/filter';
import { matchesStructuredFilter, nodePassesStructured } from '@/domain/search';
import { useOrgData } from '@/features/useOrgData';
import { useCellFlash } from '@/features/useCellFlash';
import type { AppliedPatch } from '@/features/useSsePatches';
import { UiStateProvider, useUiState } from '@/features/ui-state';
import { useDebouncedValue } from '@/features/useDebouncedValue';
import { useTableSort } from '@/features/useTableSort';
import { SPLIT_VIEW_QUERY, useMediaQuery } from '@/features/useMediaQuery';
import { AiSearchBar } from '@/components/AiSearchBar';
import { OrgTree } from '@/components/OrgTree/OrgTree';
import {
  MetricsTable,
  type MetricColumn,
  type MetricRow,
} from '@/components/MetricsTable/MetricsTable';
import { ViewToggle } from '@/components/ViewToggle';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/shared/States';

/**
 * Точка входа дашборда: UI-состояние (вид/выделение/фильтр) живёт в контексте.
 * `lastPatch` прокидывается из App (одна SSE-подписка на приложение) в
 * useOrgData (инкрементальные агрегаты) и useCellFlash (fade-out ячеек).
 */
export function OrgDashboard({ lastPatch = null }: { lastPatch?: AppliedPatch | null }) {
  return (
    <UiStateProvider>
      <DashboardBody lastPatch={lastPatch} />
    </UiStateProvider>
  );
}

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
`;

const Panes = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  min-width: 0;

  /* Split-view: дерево слева, таблица справа (Global Constraints, ≥1280px). */
  @media (min-width: 1280px) {
    flex-direction: row;
    align-items: flex-start;
  }
`;

const Pane = styled.section`
  min-width: 0;
`;

const TreePane = styled(Pane)`
  @media (min-width: 1280px) {
    flex: 1 1 32%;
  }
`;

const TablePane = styled(Pane)`
  @media (min-width: 1280px) {
    flex: 2 1 68%;
  }
`;

function DashboardBody({ lastPatch }: { lastPatch: AppliedPatch | null }) {
  const { forest, aggregates, changedCells, status, refetch } = useOrgData(lastPatch);
  // Fade-out ячеек (Task 8): ячейки последнего патча мигают 1.5с.
  const flashingCells = useCellFlash(changedCells, lastPatch?.seq ?? 0);
  const { view, selectedId, setSelectedId, nameFilter, structuredFilter } = useUiState();
  const splitView = useMediaQuery(SPLIT_VIEW_QUERY);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Раскрытие инициализируется один раз (undefined → forest); при последующих
  // refetch'ах лес пересобирается с новой идентичностью, но набор раскрытых id
  // сохраняется за пользователем.
  const prevForest = useRef<Forest | undefined>(undefined);

  useEffect(() => {
    if (forest && prevForest.current === undefined) {
      setExpanded(defaultExpandedIds(forest));
    }
    prevForest.current = forest;
  }, [forest]);

  // Выделение из таблицы: раскрываем цепочку предков, чтобы узел был виден.
  useEffect(() => {
    if (!forest || !selectedId) return;
    // oxlint-disable-next-line react/set-state-in-effect -- намеренная синхронизация с приходом выделения («adjust state on prop change»)
    setExpanded((prev) => {
      const next = new Set(prev);
      let cursor: string | null = forest.parentOf.get(selectedId) ?? null;
      while (cursor !== null) {
        next.add(cursor);
        cursor = forest.parentOf.get(cursor) ?? null;
      }
      return next.size === prev.size ? prev : next;
    });
  }, [forest, selectedId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Дебаунс фильтра — 250 мс (Global Constraints, точно). Дебаунс относится к
  // ТЕКСТОВОМУ пути (nameFilter); структурированный фильтр (AI-поиск, Task 12)
  // применяется сразу — см. AiSearchBar.
  const debouncedFilter = useDebouncedValue(nameFilter, 250);

  // Строки таблицы = все узлы леса, отфильтрованные по поддереву (совпадение
  // в имени узла ИЛИ любого потомка). Композиция фильтров (Task 12): при
  // активном structuredFilter подстроку имени даёт его nameSubstring
  // (nameFilter при этом '' — иначе сырой текст запроса вырезал бы все строки),
  // иначе — прежний текстовый путь. Числовые границы structuredFilter
  // применяются к АГРЕГАТАМ строки (полное поддерево) — именно эти значения
  // строка и показывает. Агрегаты фильтром НЕ пересчитываются.
  const metricRows = useMemo<MetricRow[]>(() => {
    if (!forest || !aggregates) return [];
    const nameQuery = structuredFilter?.nameSubstring ?? debouncedFilter;
    const visible = matchesFilter([...forest.byId.values()], nameQuery);
    return visible.flatMap((node) => {
      const agg = aggregates.get(node.id);
      if (!agg) return []; // остров вне корней — агрегатов нет (graceful degradation)
      if (
        structuredFilter &&
        !matchesStructuredFilter(
          {
            headcount: agg.totalHeadcount,
            budget: agg.totalBudget,
            performance: agg.weightedPerformance,
          },
          structuredFilter,
        )
      ) {
        return [];
      }
      return [{ id: node.id, name: node.name, depth: node.depth, ...agg }];
    });
  }, [forest, aggregates, debouncedFilter, structuredFilter]);

  // Приглушение дерева (Task 12): узлы вне структурированного фильтра получают
  // opacity вместо скрытия — структура дерева остаётся целой. Границы чисел —
  // по СОБСТВЕННЫМ значениям узла (то, что дерево показывает), nameSubstring —
  // по поддереву (предки совпавшего узла не гаснут). Если активен и текстовый
  // nameFilter — дерево гаснет по объединённому предикату (AND).
  const dimmedIds = useMemo<ReadonlySet<string>>(() => {
    if (!forest || !structuredFilter) {
      return new Set<string>();
    }
    const dimmed = new Set<string>();
    for (const node of forest.byId.values()) {
      if (!nodePassesStructured(node, structuredFilter)) {
        dimmed.add(node.id);
      } else if (debouncedFilter.trim() !== '' && !nodeMatchesFilter(node, debouncedFilter)) {
        dimmed.add(node.id);
      }
    }
    return dimmed;
  }, [forest, structuredFilter, debouncedFilter]);

  // Дефолт — по name asc; клик по столбцу — asc, повторный клик / двойной — desc.
  const { sorted, sort, toggleSort } = useTableSort<MetricRow, MetricColumn>(metricRows, {
    key: 'name',
    dir: 'asc',
  });

  if (status === 'ready' && forest) {
    const tree = (
      <OrgTree
        forest={forest}
        expanded={expanded}
        onToggle={toggle}
        selectedId={selectedId}
        dimmedIds={dimmedIds}
      />
    );
    const table = (
      <MetricsTable
        rows={sorted}
        sort={sort}
        onSortToggle={toggleSort}
        selectedId={selectedId}
        onSelect={setSelectedId}
        flashingCells={flashingCells}
      />
    );
    return (
      <Shell>
        <ViewToggle />
        {/* Единая строка поиска (Task 12): естественный язык → структурированный
            фильтр, fallback — обычный текстовый поиск. Видна в обоих видах. */}
        <AiSearchBar />
        <Panes>
          {splitView ? (
            <>
              {/* Split-view: обе панели отрендерены. */}
              <TreePane data-pane="tree">{tree}</TreePane>
              <TablePane data-pane="table">{table}</TablePane>
            </>
          ) : /* Ниже 1280px — только активная вкладка (ViewToggle переключает). */
          view === 'table' ? (
            <TablePane data-pane="table">{table}</TablePane>
          ) : (
            <TreePane data-pane="tree">{tree}</TreePane>
          )}
        </Panes>
      </Shell>
    );
  }
  if (status === 'error') {
    return <ErrorState onRetry={refetch} />;
  }
  if (status === 'empty') {
    return <EmptyState />;
  }
  return <LoadingSkeleton />;
}
