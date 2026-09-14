import { useEffect, useState } from 'react'
import { defaultExpandedIds } from '@/domain/tree'
import { useOrgData } from '@/features/useOrgData'
import { OrgTree } from '@/components/OrgTree/OrgTree'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/shared/States'

export function OrgDashboard() {
  const { forest, status, refetch } = useOrgData()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    if (forest) {
      setExpanded(defaultExpandedIds(forest))
    }
  }, [forest])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (status === 'ready' && forest) {
    return <OrgTree forest={forest} expanded={expanded} onToggle={toggle} />
  }
  if (status === 'error') {
    return <ErrorState onRetry={() => void refetch()} />
  }
  if (status === 'empty') {
    return <EmptyState />
  }
  return <LoadingSkeleton />
}
