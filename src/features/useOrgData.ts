import { useMemo, useRef } from 'react';
import { useOrgTreeQuery } from '@/data/cache';
import { aggregateForest, recomputeBranch, type Aggregates } from '@/domain/aggregation';
import { buildForest, DataError, type Forest } from '@/domain/tree';
import type { OrgNode } from '@/data/schema';
import type { AppliedPatch } from './useSsePatches';
import type { ChangedCell } from './useCellFlash';

export type OrgDataStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface OrgData {
  forest: Forest | undefined;
  /** Полные агрегаты поддерева каждого узла; undefined до 'ready'. */
  aggregates: Map<string, Aggregates> | undefined;
  status: OrgDataStatus;
  refetch: () => void;
  /**
   * Ячейки (узел + числовое поле агрегатов), чьё ЗНАЧЕНИЕ изменилось из-за
   * последнего SSE-патча: patched-узел + предки, у которых дифф нашёл расхождение.
   * Пусто после полной загрузки/refetch'а — fade-out только для патчей (Task 8).
   */
  changedCells: readonly ChangedCell[];
}

/**
 * Персистентный кеш агрегации между изменениями данных (ruling 1 Task 8):
 * один инстанс Map переживает патчи; seq — последний СЪЕДЕННЫЙ патч
 * (0 = патчей не было). forest — лес, на котором построены aggregates.
 */
interface AggregateCache {
  data: readonly OrgNode[] | undefined;
  seq: number;
  forest: Forest | undefined;
  aggregates: Map<string, Aggregates> | undefined;
  changedCells: readonly ChangedCell[];
}

/**
 * Снимок «узел + все предки» (снизу вверх) со СТАРЫМИ агрегатами — берётся
 * ДО recomputeBranch, чтобы после него диффом найти ячейки, изменившие
 * значение. Потомки patched-узла не попадают: их поддеревья патч не меняет,
 * поэтому их агрегаты не могут измениться по значению (обновляются только
 * ссылки на объекты — для fade-out они не ячейки).
 */
function snapshotAncestry(
  forest: Forest,
  aggregates: Map<string, Aggregates>,
  nodeId: string,
): [string, Aggregates | undefined][] {
  const snapshot: [string, Aggregates | undefined][] = [];
  let cursor: string | null = nodeId;
  while (cursor !== null) {
    snapshot.push([cursor, aggregates.get(cursor)]);
    cursor = forest.parentOf.get(cursor) ?? null;
  }
  return snapshot;
}

/** Дифф «значение изменилось» по трём числовым полям агрегатов. */
function diffChangedCells(
  snapshot: readonly [string, Aggregates | undefined][],
  aggregates: Map<string, Aggregates>,
): ChangedCell[] {
  const changed: ChangedCell[] = [];
  for (const [nodeId, before] of snapshot) {
    const after = aggregates.get(nodeId);
    if (!before || !after) continue;
    if (before.totalHeadcount !== after.totalHeadcount) {
      changed.push({ nodeId, field: 'totalHeadcount' });
    }
    if (before.totalBudget !== after.totalBudget) {
      changed.push({ nodeId, field: 'totalBudget' });
    }
    if (before.weightedPerformance !== after.weightedPerformance) {
      changed.push({ nodeId, field: 'weightedPerformance' });
    }
  }
  return changed;
}

/**
 * Maps the org-tree query state onto UI statuses:
 * 'loading' — no data yet, 'error' — query failed or the payload failed
 * forest validation (DataError), 'empty' — valid payload with 0 nodes,
 * 'ready' — payload built into a Forest (memoized until data changes).
 *
 * Агрегация — инкрементальная (Task 8): лес пересобирается на каждое новое
 * `query.data` (дешёвый O(n) buildForest), но один Map агрегатов живёт в ref
 * и переживает изменения данных:
 * - новый патч (`lastPatch.seq` вырос) → `recomputeBranch` по ветке patched-
 *   узла; Map и нетронутые записи сохраняют identity, `changedCells` —
 *   дифф значений по узлу и его предкам (fade-out ячеек);
 * - любые другие новые данные (первая загрузка, empty→data, retry после
 *   ошибки, refetch, смена размера массива = структурное изменение) →
 *   полный `aggregateForest`;
 * - рендер без новых данных (StrictMode-двойной вызов, патч по неизвестному
 *   id, при котором applyPatch вернул тот же массив) → кеш возвращается
 *   как есть, пересчёта нет.
 *
 * `lastPatch` передаётся с уровня App (одна SSE-подписка на приложение),
 * поэтому хук не создаёт собственный EventSource.
 */
export function useOrgData(lastPatch?: AppliedPatch | null): OrgData {
  const query = useOrgTreeQuery();
  const cacheRef = useRef<AggregateCache>({
    data: undefined,
    seq: 0,
    forest: undefined,
    aggregates: undefined,
    changedCells: [],
  });

  // `buildForest` validates the payload and throws `DataError` on a dangling
  // parentId or a cycle. The result is memoized (no recompute per render) and
  // holds either the forest or the caught error, so a `DataError` maps onto
  // the UI error state (ErrorState → refetch) instead of crashing the render.
  // Запись в cacheRef здесь безопасна: каждый путь детерминирован парой
  // (query.data, lastPatch.seq) и идемпотентен при повторном вызове useMemo
  // (StrictMode / прерванный рендер возвращает кеш как есть).
  const build = useMemo((): {
    forest: Forest | undefined;
    aggregates: Map<string, Aggregates> | undefined;
    changedCells: readonly ChangedCell[];
    error: DataError | undefined;
  } => {
    const prev = cacheRef.current;
    if (query.data === undefined) {
      cacheRef.current = {
        ...prev,
        data: undefined,
        forest: undefined,
        aggregates: undefined,
        changedCells: [],
      };
      return { forest: undefined, aggregates: undefined, changedCells: [], error: undefined };
    }
    try {
      const forest = buildForest(query.data);
      const patch = lastPatch ?? null;
      const patchApplies =
        patch !== null &&
        patch.seq !== prev.seq &&
        prev.aggregates !== undefined &&
        prev.data !== undefined &&
        // Патч не меняет структуру (applyPatch правит поля существующего узла):
        // другая длина массива — структурное изменение → полный пересчёт.
        prev.data.length === query.data.length &&
        forest.byId.has(patch.id);
      if (patchApplies) {
        const aggregates = prev.aggregates!;
        const snapshot = snapshotAncestry(forest, aggregates, patch.id);
        recomputeBranch(forest, aggregates, [patch.id]);
        const changedCells = diffChangedCells(snapshot, aggregates);
        cacheRef.current = { data: query.data, seq: patch.seq, forest, aggregates, changedCells };
        return { forest, aggregates, changedCells, error: undefined };
      }
      if (prev.aggregates !== undefined && prev.data === query.data) {
        // Рендер без новых данных — кеш валиден (identity сохранена).
        cacheRef.current = { ...prev, forest };
        return {
          forest,
          aggregates: prev.aggregates,
          changedCells: prev.changedCells,
          error: undefined,
        };
      }
      const aggregates = aggregateForest(forest);
      cacheRef.current = {
        data: query.data,
        seq: patch?.seq ?? prev.seq,
        forest,
        aggregates,
        changedCells: [],
      };
      return { forest, aggregates, changedCells: [], error: undefined };
    } catch (error) {
      if (!(error instanceof DataError)) throw error;
      cacheRef.current = {
        ...prev,
        data: query.data,
        forest: undefined,
        aggregates: undefined,
        changedCells: [],
      };
      return { forest: undefined, aggregates: undefined, changedCells: [], error };
    }
  }, [query.data, lastPatch]);

  let status: OrgDataStatus;
  if (query.isError || build.error !== undefined) {
    status = 'error';
  } else if (query.isPending || query.data === undefined) {
    status = 'loading';
  } else {
    status = query.data.length === 0 ? 'empty' : 'ready';
  }

  return {
    forest: build.forest,
    aggregates: build.aggregates,
    changedCells: build.changedCells,
    status,
    refetch: query.refetch,
  };
}
