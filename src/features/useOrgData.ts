import { useMemo } from 'react'
import { useOrgTreeQuery } from '@/data/cache'
import { buildForest, type Forest } from '@/domain/tree'

export type OrgDataStatus = 'loading' | 'error' | 'empty' | 'ready'

export interface OrgData {
  forest: Forest | undefined
  status: OrgDataStatus
  refetch: () => void
}

/**
 * Maps the org-tree query state onto UI statuses:
 * 'loading' — no data yet, 'error' — query failed, 'empty' — valid payload with
 * 0 nodes, 'ready' — payload built into a Forest (memoized until data changes).
 */
export function useOrgData(): OrgData {
  const query = useOrgTreeQuery()

  const forest = useMemo(
    () => (query.data === undefined ? undefined : buildForest(query.data)),
    [query.data],
  )

  let status: OrgDataStatus
  if (query.isError) {
    status = 'error'
  } else if (query.isPending || query.data === undefined) {
    status = 'loading'
  } else {
    status = query.data.length === 0 ? 'empty' : 'ready'
  }

  return { forest, status, refetch: query.refetch }
}
