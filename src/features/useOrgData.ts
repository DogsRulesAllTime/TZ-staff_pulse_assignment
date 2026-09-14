import { useMemo } from 'react'
import { useOrgTreeQuery } from '@/data/cache'
import { aggregateForest, type Aggregates } from '@/domain/aggregation'
import { buildForest, DataError, type Forest } from '@/domain/tree'

export type OrgDataStatus = 'loading' | 'error' | 'empty' | 'ready'

export interface OrgData {
  forest: Forest | undefined
  /** Полные агрегаты поддерева каждого узла; undefined до 'ready'. */
  aggregates: Map<string, Aggregates> | undefined
  status: OrgDataStatus
  refetch: () => void
}

/**
 * Maps the org-tree query state onto UI statuses:
 * 'loading' — no data yet, 'error' — query failed or the payload failed
 * forest validation (DataError), 'empty' — valid payload with 0 nodes,
 * 'ready' — payload built into a Forest (memoized until data changes).
 *
 * `aggregates` — один post-order DFS над лесом (`aggregateForest`),
 * мемоизирован в том же useMemo, что и лес: новые данные → новый лес →
 * новые агрегаты, без пересчёта на каждый рендер.
 */
export function useOrgData(): OrgData {
  const query = useOrgTreeQuery()

  // `buildForest` validates the payload and throws `DataError` on a dangling
  // parentId or a cycle. The result is memoized (no recompute per render) and
  // holds either the forest or the caught error, so a `DataError` maps onto
  // the UI error state (ErrorState → refetch) instead of crashing the render.
  const build = useMemo((): {
    forest: Forest | undefined
    aggregates: Map<string, Aggregates> | undefined
    error: DataError | undefined
  } => {
    if (query.data === undefined) {
      return { forest: undefined, aggregates: undefined, error: undefined }
    }
    try {
      const forest = buildForest(query.data)
      return { forest, aggregates: aggregateForest(forest), error: undefined }
    } catch (error) {
      if (!(error instanceof DataError)) throw error
      return { forest: undefined, aggregates: undefined, error }
    }
  }, [query.data])

  let status: OrgDataStatus
  if (query.isError || build.error !== undefined) {
    status = 'error'
  } else if (query.isPending || query.data === undefined) {
    status = 'loading'
  } else {
    status = query.data.length === 0 ? 'empty' : 'ready'
  }

  return {
    forest: build.forest,
    aggregates: build.aggregates,
    status,
    refetch: query.refetch,
  }
}
