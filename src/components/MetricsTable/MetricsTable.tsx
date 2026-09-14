import styled, { keyframes } from 'styled-components';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { SortState } from '@/features/useTableSort';
import { formatBudget, formatPerformance } from '@/domain/format';
import { cellFlashKey, type FlashField } from '@/features/useCellFlash';
import { PerformanceDot } from '@/components/shared/PerformanceDot';

/** Плоская строка таблицы: узел + агрегаты его полного поддерева. */
export interface MetricRow {
  id: string;
  name: string;
  /** 0 = дивизион, 1 = отдел, 2 = команда. */
  depth: number;
  totalHeadcount: number;
  totalBudget: number;
  weightedPerformance: number;
}

export type MetricColumn =
  'name' | 'depth' | 'totalHeadcount' | 'totalBudget' | 'weightedPerformance';

export interface MetricsTableProps {
  /** Уже отфильтрованные и отсортированные строки (sort/filter живут у вызывающего). */
  rows: readonly MetricRow[];
  sort: SortState<MetricColumn>;
  onSortToggle: (key: MetricColumn) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  /**
   * Fade-out (Task 8): `cellFlashKey → счётчик вспышек` из useCellFlash.
   * Ключ есть → ячейка мигает; чётность счётчика выбирает одну из двух
   * одинаковых keyframes-анимаций, чтобы повторный патч перезапускал
   * анимацию, пока предыдущая не истекла.
   */
  flashingCells?: ReadonlyMap<string, number>;
}

const LEVEL_LABELS = ['Дивизион', 'Отдел', 'Команда'] as const;

export function levelLabel(depth: number): string {
  return LEVEL_LABELS[depth] ?? `Уровень ${depth}`;
}

const COLUMNS: { key: MetricColumn; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Подразделение' },
  { key: 'depth', label: 'Уровень' },
  { key: 'totalHeadcount', label: 'Всего сотрудников', numeric: true },
  { key: 'totalBudget', label: 'Бюджет суммарный', numeric: true },
  { key: 'weightedPerformance', label: 'Средняя эффективность', numeric: true },
];

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`;

const FilterInput = styled.input`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: 1px solid ${({ theme }) => theme.colors.textMuted}55;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.text};
    outline-offset: 1px;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.textMuted}33;
  border-radius: ${({ theme }) => theme.radii.md};
`;

const Th = styled.th`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.textMuted}44;
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const ThNumeric = styled(Th)`
  text-align: right;
`;

const SortButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  color: inherit;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.textMuted}22;
`;

/**
 * Fade-out обновлённой ячейки (бриф Task 8): opacity 1 → 0.35 → 1 за 1.5s.
 * Два идентичных keyframes с разными именами — приём перезапуска анимации:
 * смена data-flash-parity (чётность счётчика вспышек из useCellFlash) меняет
 * совпадающий селектор, и анимация стартует заново на уже мигающей ячейке.
 */
const fadeOutCell = keyframes`
  from {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
`;

const fadeOutCellAlt = keyframes`
  from {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
`;

const TdNumeric = styled(Td)`
  text-align: right;
  /* Числа таблицы выровнены по разрядам (Global Constraints). */
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  &[data-changed='true'][data-flash-parity='even'] {
    animation: ${fadeOutCell} 1.5s ease-in-out;
  }

  &[data-changed='true'][data-flash-parity='odd'] {
    animation: ${fadeOutCellAlt} 1.5s ease-in-out;
  }

  /* prefers-reduced-motion: значение обновляется без анимации (theme.motion).
     Селекторы повторяют мигающие (та же специфичность, источник ниже) —
     иначе одна анимация не перебила бы другую. */
  @media ${({ theme }) => theme.motion} {
    &[data-changed='true'][data-flash-parity='even'],
    &[data-changed='true'][data-flash-parity='odd'] {
      animation: none;
    }
  }
`;

const Tr = styled.tr<{ $selected: boolean }>`
  cursor: pointer;
  background: ${({ $selected, theme }) => ($selected ? `${theme.colors.text}14` : 'transparent')};

  &:hover {
    background: ${({ theme }) => `${theme.colors.textMuted}14`};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.text};
    outline-offset: -2px;
  }
`;

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`;

const NameText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PerfCell = styled(NameCell)`
  justify-content: flex-end;
`;

const EmptyRow = styled.td`
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/**
 * Presentational таблица агрегатов. Фильтрация и сортировка выполняются
 * выше (useDebouncedValue + useTableSort); здесь — отображение и колбэки.
 * Агрегаты в строках — полные агрегаты поддерева: фильтр их не пересчитывает.
 * Fade-out (Task 8): data-changed ставится ТОЛЬКО на мигающие числовые ячейки
 * (headcount/budget/performance конкретного узла), не на строку и не на таблицу.
 */
const NUMERIC_FIELDS: readonly FlashField[] = [
  'totalHeadcount',
  'totalBudget',
  'weightedPerformance',
];

/**
 * Клавиши построчной навигации (Task 9). ArrowLeft/ArrowRight намеренно
 * не перехватываются (YAGNI по заданию).
 */
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

/**
 * Roving-навигация по видимым строкам таблицы: ArrowUp/ArrowDown →
 * предыдущая/следующая строка, Home → первая, End → последняя. Фокус —
 * реальный DOM-фокус (element.focus()); страница не скроллится
 * (preventDefault на обработанных клавишах); строка вне вьюпорта
 * подтягивается через scrollIntoView({block:'nearest'}).
 */
function handleRowNavKey(event: ReactKeyboardEvent<HTMLTableRowElement>) {
  // Модификаторы (Ctrl/Meta/Alt/Shift + клавиша) — браузерные/ОС-шорткаты,
  // построчную навигацию не трогаем.
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (!NAV_KEYS.has(event.key)) return;
  const tbody = event.currentTarget.closest('tbody');
  if (!tbody) return;
  const rowEls = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]'));
  const current = rowEls.indexOf(event.currentTarget);
  if (rowEls.length === 0 || current === -1) return;
  const next =
    event.key === 'ArrowDown'
      ? Math.min(current + 1, rowEls.length - 1)
      : event.key === 'ArrowUp'
        ? Math.max(current - 1, 0)
        : event.key === 'Home'
          ? 0
          : rowEls.length - 1;
  event.preventDefault();
  const target = rowEls[next];
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
}

export function MetricsTable({
  rows,
  sort,
  onSortToggle,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  flashingCells,
}: MetricsTableProps) {
  const flashAttrs = (nodeId: string, field: FlashField) => {
    if (!flashingCells) return {};
    const flashCount = flashingCells.get(cellFlashKey({ nodeId, field }));
    if (flashCount === undefined) return {};
    return {
      'data-changed': 'true',
      'data-flash-parity': flashCount % 2 === 0 ? 'even' : 'odd',
    };
  };

  return (
    <Wrapper>
      <FilterInput
        type="search"
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
        placeholder="Фильтр по названию"
        aria-label="Фильтр по названию"
      />
      {/* role="grid": aria-selected на <tr> валиден в ARIA только внутри grid/treegrid. */}
      <Table role="grid">
        <thead>
          <tr>
            {COLUMNS.map(({ key, label, numeric }) => {
              const sorted = sort.key === key;
              const ThCell = numeric ? ThNumeric : Th;
              return (
                <ThCell
                  key={key}
                  aria-sort={sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <SortButton type="button" onClick={() => onSortToggle(key)}>
                    {label}
                    {sorted && <span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                  </SortButton>
                </ThCell>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <EmptyRow colSpan={COLUMNS.length}>Ничего не найдено</EmptyRow>
            </tr>
          ) : (
            rows.map((row) => (
              <Tr
                key={row.id}
                $selected={row.id === selectedId}
                data-row-id={row.id}
                tabIndex={0}
                aria-selected={row.id === selectedId}
                aria-label={row.name}
                title={row.name}
                onClick={() => onSelect(row.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row.id);
                    return;
                  }
                  handleRowNavKey(event);
                }}
              >
                <Td>
                  <NameCell>
                    <NameText>{row.name}</NameText>
                  </NameCell>
                </Td>
                <Td>{levelLabel(row.depth)}</Td>
                <TdNumeric {...flashAttrs(row.id, NUMERIC_FIELDS[0])}>
                  {row.totalHeadcount}
                </TdNumeric>
                <TdNumeric {...flashAttrs(row.id, NUMERIC_FIELDS[1])}>
                  {formatBudget(row.totalBudget)}
                </TdNumeric>
                <TdNumeric {...flashAttrs(row.id, NUMERIC_FIELDS[2])}>
                  <PerfCell>
                    <PerformanceDot value={row.weightedPerformance} />
                    <span>{formatPerformance(row.weightedPerformance)}</span>
                  </PerfCell>
                </TdNumeric>
              </Tr>
            ))
          )}
        </tbody>
      </Table>
    </Wrapper>
  );
}
