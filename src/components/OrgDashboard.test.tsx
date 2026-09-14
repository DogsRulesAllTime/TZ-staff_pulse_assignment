import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { theme } from '@/app/theme'
import { buildForest, type Forest, type TreeNodeInput } from '@/domain/tree'
import type { OrgData } from '@/features/useOrgData'
import { OrgDashboard } from './OrgDashboard'

vi.mock('@/features/useOrgData', () => ({
  useOrgData: vi.fn(),
}))

const useOrgData = vi.mocked((await import('@/features/useOrgData')).useOrgData)

const updatedAt = '2025-01-01T00:00:00.000Z'

const fixture: TreeNodeInput[] = [
  { id: 'div-1', name: 'Дивизион 1', parentId: null, headcount: 100, budget: 1000, performance: 85, updatedAt },
  { id: 'dept-1-1', name: 'Отдел 1.1', parentId: 'div-1', headcount: 40, budget: 500, performance: 60, updatedAt },
  { id: 'team-1-1-1', name: 'Команда 1.1.1', parentId: 'dept-1-1', headcount: 10, budget: 100, performance: 90, updatedAt },
]

function setOrgData(forest: Forest | undefined, status: OrgData['status'] = 'ready') {
  vi.mocked(useOrgData).mockReturnValue({ forest, status, refetch: vi.fn() })
}

function renderDashboard() {
  return render(
    <ThemeProvider theme={theme}>
      <OrgDashboard />
    </ThemeProvider>,
  )
}

/** The treeitem <li> of a row, found via its unique visible name span. */
function rowOf(name: string): HTMLElement {
  return screen.getByText(name, { exact: true }).closest('li')!
}

describe('OrgDashboard', () => {
  beforeEach(() => {
    vi.mocked(useOrgData).mockReset()
  })

  it('renders the second level expanded on first data', () => {
    setOrgData(buildForest(fixture))
    renderDashboard()

    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Команда 1.1.1')).toBeInTheDocument()
  })

  it('preserves the user expansion across a refetch that rebuilds the forest', async () => {
    const user = userEvent.setup()
    setOrgData(buildForest(fixture))
    const { rerender } = renderDashboard()

    await user.click(rowOf('Отдел 1.1').querySelector('[data-chevron]')!)
    expect(screen.queryByText('Команда 1.1.1')).not.toBeInTheDocument()

    // Refetch (refocus, staleTime) returns a fresh forest object of the same shape.
    setOrgData(buildForest(fixture))
    rerender(
      <ThemeProvider theme={theme}>
        <OrgDashboard />
      </ThemeProvider>,
    )

    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Команда 1.1.1')).not.toBeInTheDocument()
  })
})
