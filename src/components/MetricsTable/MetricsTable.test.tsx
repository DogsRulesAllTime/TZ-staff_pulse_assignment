import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { describe, expect, it, vi } from 'vitest'
import { theme } from '@/app/theme'
import { MetricsTable, type MetricRow } from './MetricsTable'

const rows: MetricRow[] = [
  { id: 'div-1', name: 'Дивизион 1', depth: 0, totalHeadcount: 110, totalBudget: 1_600_000, weightedPerformance: 67 },
  { id: 'dept-1-1', name: 'Отдел 1.1', depth: 1, totalHeadcount: 10, totalBudget: 650_000, weightedPerformance: 54 },
]

function renderTable(overrides: Partial<Parameters<typeof MetricsTable>[0]> = {}) {
  const props: Parameters<typeof MetricsTable>[0] = {
    rows,
    sort: { key: 'name', dir: 'asc' },
    onSortToggle: vi.fn(),
    selectedId: null,
    onSelect: vi.fn(),
    filter: '',
    onFilterChange: vi.fn(),
    ...overrides,
  }
  render(
    <ThemeProvider theme={theme}>
      <MetricsTable {...props} />
    </ThemeProvider>,
  )
  return props
}

describe('MetricsTable', () => {
  it('renders the five assignment columns', () => {
    renderTable()

    for (const label of [
      'Подразделение',
      'Уровень',
      'Всего сотрудников',
      'Бюджет суммарный',
      'Средняя эффективность',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('renders aggregate values: headcount, ru-RU budget, performance', () => {
    renderTable()

    expect(screen.getByText('10')).toBeInTheDocument()
    // NBSP из formatBudget: RTL нормализует текст DOM (включая U+00A0) в пробел,
    // поэтому в компонентных тестах строка-запрос — с обычными пробелами.
    // Точный контракт «12 345 678 руб.» с U+00A0 покрыт в domain/format.test.ts.
    expect(screen.getByText('650 000 руб.')).toBeInTheDocument()
    expect(screen.getByText('54 %')).toBeInTheDocument()
    expect(screen.getByText('Отдел')).toBeInTheDocument() // уровень depth=1
  })

  it('marks the sorted column with aria-sort', () => {
    renderTable({ sort: { key: 'totalBudget', dir: 'desc' } })

    const budgetHeader = screen.getByRole('button', { name: 'Бюджет суммарный' }).closest('th')!
    expect(budgetHeader).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('button', { name: 'Подразделение' }).closest('th')).not.toHaveAttribute(
      'aria-sort',
    )
  })

  it('toggles sort via the header button', async () => {
    const user = userEvent.setup()
    const props = renderTable()

    await user.click(screen.getByRole('button', { name: 'Всего сотрудников' }))
    expect(props.onSortToggle).toHaveBeenCalledWith('totalHeadcount')
  })

  it('selects a node on row click', async () => {
    const user = userEvent.setup()
    const props = renderTable()

    await user.click(screen.getByText('Отдел 1.1'))
    expect(props.onSelect).toHaveBeenCalledWith('dept-1-1')
  })

  it('marks the selected row with aria-selected and is keyboard-focusable', () => {
    renderTable({ selectedId: 'dept-1-1' })

    const row = screen.getByRole('row', { name: 'Отдел 1.1' })
    expect(row).toHaveAttribute('aria-selected', 'true')
    expect(row).toHaveAttribute('tabindex', '0')

    const otherRow = screen.getByRole('row', { name: 'Дивизион 1' })
    expect(otherRow).toHaveAttribute('aria-selected', 'false')
  })

  it('selects a node on row Enter', async () => {
    const user = userEvent.setup()
    const props = renderTable()

    const row = screen.getByText('Отдел 1.1').closest('tr')!
    row.focus()
    expect(row).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(props.onSelect).toHaveBeenCalledWith('dept-1-1')
  })

  it('selects a node on row Space', async () => {
    const user = userEvent.setup()
    const props = renderTable()

    const row = screen.getByText('Дивизион 1').closest('tr')!
    row.focus()
    expect(row).toHaveFocus()

    await user.keyboard(' ')
    expect(props.onSelect).toHaveBeenCalledWith('div-1')
  })

  it('propagates filter input changes', async () => {
    const user = userEvent.setup()
    const props = renderTable()

    await user.type(screen.getByRole('searchbox', { name: 'Фильтр по названию' }), 'отдел')
    expect(props.onFilterChange).toHaveBeenCalled()
  })

  it('shows an empty state when no rows match the filter', () => {
    renderTable({ rows: [] })

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
  })
})
