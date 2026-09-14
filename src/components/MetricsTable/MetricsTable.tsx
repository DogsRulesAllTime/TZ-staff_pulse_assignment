import styled from 'styled-components'
import type { SortState } from '@/features/useTableSort'
import { formatBudget, formatPerformance } from '@/domain/format'
import { PerformanceDot } from '@/components/shared/PerformanceDot'

/** Плоская строка таблицы: узел + агрегаты его полного поддерева. */
export interface MetricRow {
  id: string
  name: string
  /** 0 = дивизион, 1 = отдел, 2 = команда. */
  depth: number
  totalHeadcount: number
  totalBudget: number
  weightedPerformance: number
}

export type MetricColumn =
  | 'name'
  | 'depth'
  | 'totalHeadcount'
  | 'totalBudget'
  | 'weightedPerformance'

export interface MetricsTableProps {
  /** Уже отфильтрованные и отсортированные строки (sort/filter живут у вызывающего). */
  rows: readonly MetricRow[]
  sort: SortState<MetricColumn>
  onSortToggle: (key: MetricColumn) => void
  selectedId: string | null
  onSelect: (id: string) => void
  filter: string
  onFilterChange: (value: string) => void
}

const LEVEL_LABELS = ['Дивизион', 'Отдел', 'Команда'] as const

export function levelLabel(depth: number): string {
  return LEVEL_LABELS[depth] ?? `Уровень ${depth}`
}

const COLUMNS: { key: MetricColumn; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Подразделение' },
  { key: 'depth', label: 'Уровень' },
  { key: 'totalHeadcount', label: 'Всего сотрудников', numeric: true },
  { key: 'totalBudget', label: 'Бюджет суммарный', numeric: true },
  { key: 'weightedPerformance', label: 'Средняя эффективность', numeric: true },
]

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`

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
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.textMuted}33;
  border-radius: ${({ theme }) => theme.radii.md};
`

const Th = styled.th`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.textMuted}44;
  text-align: left;
  font-size: 0.8125rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`

const ThNumeric = styled(Th)`
  text-align: right;
`

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
`

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.textMuted}22;
`

const TdNumeric = styled(Td)`
  text-align: right;
  /* Числа таблицы выровнены по разрядам (Global Constraints). */
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`

const Tr = styled.tr<{ $selected: boolean }>`
  cursor: pointer;
  background: ${({ $selected, theme }) =>
    $selected ? `${theme.colors.text}14` : 'transparent'};

  &:hover {
    background: ${({ theme }) => `${theme.colors.textMuted}14`};
  }
`

const NameCell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-width: 0;
`

const NameText = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const PerfCell = styled(NameCell)`
  justify-content: flex-end;
`

const EmptyRow = styled.td`
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
`

/**
 * Presentational таблица агрегатов. Фильтрация и сортировка выполняются
 * выше (useDebouncedValue + useTableSort); здесь — отображение и колбэки.
 * Агрегаты в строках — полные агрегаты поддерева: фильтр их не пересчитывает.
 */
export function MetricsTable({
  rows,
  sort,
  onSortToggle,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: MetricsTableProps) {
  return (
    <Wrapper>
      <FilterInput
        type="search"
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
        placeholder="Фильтр по названию"
        aria-label="Фильтр по названию"
      />
      <Table>
        <thead>
          <tr>
            {COLUMNS.map(({ key, label, numeric }) => {
              const sorted = sort.key === key
              const ThCell = numeric ? ThNumeric : Th
              return (
                <ThCell
                  key={key}
                  aria-sort={
                    sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  <SortButton type="button" onClick={() => onSortToggle(key)}>
                    {label}
                    {sorted && (
                      <span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </SortButton>
                </ThCell>
              )
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
                onClick={() => onSelect(row.id)}
              >
                <Td>
                  <NameCell>
                    <NameText>{row.name}</NameText>
                  </NameCell>
                </Td>
                <Td>{levelLabel(row.depth)}</Td>
                <TdNumeric>{row.totalHeadcount}</TdNumeric>
                <TdNumeric>{formatBudget(row.totalBudget)}</TdNumeric>
                <TdNumeric>
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
  )
}
