import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ThemeProvider } from 'styled-components'
import { describe, expect, it } from 'vitest'
import { theme } from '@/app/theme'
import { buildForest, defaultExpandedIds, type Forest, type TreeNode } from '@/domain/tree'
import { OrgTree } from './OrgTree'

type NodeInput = Omit<TreeNode, 'children' | 'depth'>

function node(partial: Partial<NodeInput> & Pick<NodeInput, 'id'>): NodeInput {
  return {
    name: partial.id,
    parentId: null,
    headcount: 1,
    budget: 1000,
    performance: 80,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  }
}

const fixture: NodeInput[] = [
  node({ id: 'div-1', name: 'Дивизион 1', headcount: 100, performance: 85 }),
  node({ id: 'dept-1-1', name: 'Отдел 1.1', parentId: 'div-1', headcount: 40, performance: 60 }),
  node({ id: 'dept-1-2', name: 'Отдел 1.2', parentId: 'div-1', headcount: 60, performance: 30 }),
  node({ id: 'team-1-1-1', name: 'Команда 1.1.1', parentId: 'dept-1-1', headcount: 10, performance: 90 }),
]

function Harness({ forest }: { forest: Forest }) {
  const [expanded, setExpanded] = useState(() => defaultExpandedIds(forest))
  return (
    <ThemeProvider theme={theme}>
      <OrgTree
        forest={forest}
        expanded={expanded}
        onToggle={(id) =>
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
      />
    </ThemeProvider>
  )
}

function renderFixture() {
  return render(<Harness forest={buildForest(fixture)} />)
}

/** The treeitem <li> of a row, found via its unique visible name span. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name, { exact: true }).closest('li')!
}

describe('OrgTree', () => {
  it('renders the second level (departments and teams) without any clicks', () => {
    renderFixture()

    expect(rowOf('Дивизион 1')).toBeInTheDocument()
    expect(rowOf('Отдел 1.1')).toBeInTheDocument()
    expect(rowOf('Отдел 1.2')).toBeInTheDocument()
    expect(rowOf('Команда 1.1.1')).toBeInTheDocument()
  })

  it('shows node headcount in people units', () => {
    renderFixture()

    expect(screen.getByText('100 чел.')).toBeInTheDocument()
    expect(screen.getByText('10 чел.')).toBeInTheDocument()
  })

  it.each([
    ['Дивизион 1', 85, 'rgb(46, 158, 91)'],
    ['Отдел 1.1', 60, 'rgb(224, 168, 0)'],
    ['Отдел 1.2', 30, 'rgb(214, 69, 69)'],
    ['Команда 1.1.1', 90, 'rgb(46, 158, 91)'],
  ])('colors the performance dot of «%s» (value %i)', (name, _value, expectedColor) => {
    renderFixture()

    const dot = rowOf(name).querySelector('[data-dot]')
    expect(dot).not.toBeNull()
    expect(getComputedStyle(dot as Element).backgroundColor).toBe(expectedColor)
  })

  it('collapses a branch on chevron click and expands it again', async () => {
    const user = userEvent.setup()
    renderFixture()

    const dept = rowOf('Отдел 1.1')
    expect(dept).toHaveAttribute('aria-expanded', 'true')

    await user.click(dept.querySelector('[data-chevron]')!)
    expect(screen.queryByText('Команда 1.1.1')).not.toBeInTheDocument()
    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'false')

    await user.click(rowOf('Отдел 1.1').querySelector('[data-chevron]')!)
    expect(screen.getByText('Команда 1.1.1')).toBeInTheDocument()
    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders leaf nodes without a chevron', () => {
    renderFixture()

    const team = rowOf('Команда 1.1.1')
    expect(team.querySelector('[data-chevron]')).toBeNull()
    expect(team).not.toHaveAttribute('aria-expanded')
  })
})
