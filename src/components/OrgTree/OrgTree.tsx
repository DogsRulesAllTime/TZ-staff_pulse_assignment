import styled from 'styled-components'
import type { Forest } from '@/domain/tree'
import { OrgNodeRow } from './OrgNodeRow'

export interface OrgTreeProps {
  forest: Forest
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
}

const Tree = styled.ul`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  list-style: none;
`

/**
 * Presentational recursive tree. Expansion state is owned by the caller via
 * `expanded` + `onToggle`; no data fetching and no selection logic here.
 */
export function OrgTree({ forest, expanded, onToggle }: OrgTreeProps) {
  return (
    <Tree role="tree" aria-label="Организационная структура">
      {forest.roots.map((root) => (
        <OrgNodeRow key={root.id} node={root} expanded={expanded} onToggle={onToggle} />
      ))}
    </Tree>
  )
}
