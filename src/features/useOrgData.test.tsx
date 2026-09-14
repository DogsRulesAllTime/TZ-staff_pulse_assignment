import { StrictMode, type ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrgData } from './useOrgData'
import type { AppliedPatch } from './useSsePatches'
import { buildForest } from '@/domain/tree'
import { node, type NodeInput } from '@/test/factories'

vi.mock('@/data/cache', () => ({
  ORG_TREE_KEY: ['org-tree'] as const,
  useOrgTreeQuery: vi.fn(),
}))

const useOrgTreeQuery = vi.mocked(
  (await import('@/data/cache')).useOrgTreeQuery,
)

const fixture: NodeInput[] = [
  node({ id: 'div-1' }),
  node({ id: 'dept-1-1', parentId: 'div-1' }),
  node({ id: 'team-1-1-1', parentId: 'dept-1-1' }),
]

describe('useOrgData', () => {
  beforeEach(() => {
    vi.mocked(useOrgTreeQuery).mockReset()
  })

  it('maps a pending query to status "loading"', () => {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'pending',
      fetchStatus: 'fetching',
      isPending: true,
      isError: false,
      data: undefined,
      refetch: vi.fn(),
    } as never)

    const { result } = renderHook(() => useOrgData())

    expect(result.current.status).toBe('loading')
    expect(result.current.forest).toBeUndefined()
  })

  it('maps a failed query to status "error"', () => {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'error',
      fetchStatus: 'idle',
      isPending: false,
      isError: true,
      error: new Error('boom'),
      data: undefined,
      refetch: vi.fn(),
    } as never)

    const { result } = renderHook(() => useOrgData())

    expect(result.current.status).toBe('error')
  })

  it('maps an empty valid payload to status "empty"', () => {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'success',
      fetchStatus: 'idle',
      isPending: false,
      isError: false,
      data: [],
      refetch: vi.fn(),
    } as never)

    const { result } = renderHook(() => useOrgData())

    expect(result.current.status).toBe('empty')
  })

  it('maps a successful payload to status "ready" and memoizes the forest', () => {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'success',
      fetchStatus: 'idle',
      isPending: false,
      isError: false,
      data: fixture,
      refetch: vi.fn(),
    } as never)

    const { result, rerender } = renderHook(() => useOrgData())

    expect(result.current.status).toBe('ready')
    const forest = result.current.forest!
    expect(forest.roots.map((root) => root.id)).toEqual(['div-1'])
    expect(forest).toEqual(buildForest(fixture))

    rerender()
    expect(result.current.forest).toBe(forest)
  })

  it('maps a payload with a dangling parentId to status "error" instead of crashing', () => {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'success',
      fetchStatus: 'idle',
      isPending: false,
      isError: false,
      data: [node({ id: 'div-1' }), node({ id: 'orphan', parentId: 'missing' })],
      refetch: vi.fn(),
    } as never)

    const { result } = renderHook(() => useOrgData())

    expect(result.current.status).toBe('error')
    expect(result.current.forest).toBeUndefined()
  })

  it('maps a cyclic payload to status "error" instead of crashing', () => {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'success',
      fetchStatus: 'idle',
      isPending: false,
      isError: false,
      data: [node({ id: 'a', parentId: 'b' }), node({ id: 'b', parentId: 'a' })],
      refetch: vi.fn(),
    } as never)

    const { result } = renderHook(() => useOrgData())

    expect(result.current.status).toBe('error')
    expect(result.current.forest).toBeUndefined()
  })

  it('exposes the query refetch', () => {
    const refetch = vi.fn()
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: 'success',
      fetchStatus: 'idle',
      isPending: false,
      isError: false,
      data: fixture,
      refetch,
    } as never)

    const { result } = renderHook(() => useOrgData())

    expect(result.current.refetch).toBe(refetch)
  })
})

describe('useOrgData — инкрементальная агрегация (Task 8)', () => {
  /** Две ветки: патч по div-1 должен не тронуть агрегаты ветки div-2. */
  const tree: NodeInput[] = [
    node({ id: 'div-1' }),
    node({ id: 'dept-1-1', parentId: 'div-1' }),
    node({ id: 'team-1-1-1', parentId: 'dept-1-1' }),
    node({ id: 'div-2' }),
    node({ id: 'dept-2-1', parentId: 'div-2' }),
  ]

  const patchOf = (seq: number, id: string): AppliedPatch => ({
    seq,
    id,
    affectedIds: [id],
    updatedAt: '2025-01-02T00:00:00.000Z',
  })

  function mockQuery(data: NodeInput[] | undefined) {
    vi.mocked(useOrgTreeQuery).mockReturnValue({
      status: data === undefined ? 'pending' : 'success',
      fetchStatus: data === undefined ? 'fetching' : 'idle',
      isPending: data === undefined,
      isError: false,
      data,
      refetch: vi.fn(),
    } as never)
  }

  function renderOrgData(
    data: NodeInput[],
    options: { strict?: boolean } = {},
  ) {
    mockQuery(data)
    const wrapper =
      options.strict === true
        ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
        : ({ children }: { children: ReactNode }) => <>{children}</>
    return renderHook((props: { lastPatch: AppliedPatch | null }) => useOrgData(props.lastPatch), {
      initialProps: { lastPatch: null as AppliedPatch | null },
      wrapper,
    })
  }

  function patchTeamHeadcount(data: NodeInput[], headcount: number): NodeInput[] {
    return data.map((n) =>
      n.id === 'team-1-1-1' ? { ...n, headcount, updatedAt: '2025-01-02T00:00:00.000Z' } : n,
    )
  }

  it('(a) применяет патч инкрементально: Map тот же, ветка пересчитана, соседи сохранили identity', () => {
    const { result, rerender } = renderOrgData(tree)
    const aggregates = result.current.aggregates!
    expect(result.current.changedCells).toEqual([])
    const untouchedDiv2 = aggregates.get('div-2')
    const untouchedDept21 = aggregates.get('dept-2-1')
    const prevDiv1 = aggregates.get('div-1')

    mockQuery(patchTeamHeadcount(tree, 5))
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })

    // Контракт recomputeBranch: тот же инстанс Map, мутируемый на месте.
    expect(result.current.aggregates).toBe(aggregates)
    // Нетронутая ветка — прежние объекты (полный DFS не запускался).
    expect(aggregates.get('div-2')).toBe(untouchedDiv2)
    expect(aggregates.get('dept-2-1')).toBe(untouchedDept21)
    // Затронутая ветка — новые объекты со свежими значениями.
    expect(aggregates.get('div-1')).not.toBe(prevDiv1)
    expect(aggregates.get('team-1-1-1')!.totalHeadcount).toBe(5)
    expect(aggregates.get('dept-1-1')!.totalHeadcount).toBe(6) // 1 своя + 5 команды
    expect(aggregates.get('div-1')!.totalHeadcount).toBe(7)
  })

  it('(a) сообщает ровно изменившиеся ячейки: узел, затем предки снизу вверх', () => {
    const { result, rerender } = renderOrgData(tree)

    mockQuery(patchTeamHeadcount(tree, 5))
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })

    // headcount команды меняет только totalHeadcount по ветке:
    // бюджеты не тронуты, weightedPerformance (80) не меняется.
    expect(result.current.changedCells).toEqual([
      { nodeId: 'team-1-1-1', field: 'totalHeadcount' },
      { nodeId: 'dept-1-1', field: 'totalHeadcount' },
      { nodeId: 'div-1', field: 'totalHeadcount' },
    ])
  })

  it('патч только performance меняет только weightedPerformance-ячейки', () => {
    const { result, rerender } = renderOrgData(tree)

    const patched = tree.map((n) =>
      n.id === 'team-1-1-1' ? { ...n, performance: 50, updatedAt: '2025-01-02T00:00:00.000Z' } : n,
    )
    mockQuery(patched)
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })

    expect(result.current.changedCells).toEqual([
      { nodeId: 'team-1-1-1', field: 'weightedPerformance' },
      { nodeId: 'dept-1-1', field: 'weightedPerformance' },
      { nodeId: 'div-1', field: 'weightedPerformance' },
    ])
    expect(result.current.aggregates!.get('dept-1-1')!.weightedPerformance).toBeCloseTo(65) // (80·1 + 50·1) / 2
  })

  it('патч по неизвестному id — no-op: без пересчёта и без flash-ячеек', () => {
    const { result, rerender } = renderOrgData(tree)
    const aggregates = result.current.aggregates!
    const prevDiv1 = aggregates.get('div-1')

    // Данные не изменились (applyPatch вернул тот же массив), lastPatch.seq вырос.
    rerender({ lastPatch: patchOf(1, 'ghost') })

    expect(result.current.aggregates).toBe(aggregates)
    expect(aggregates.get('div-1')).toBe(prevDiv1)
    expect(result.current.changedCells).toEqual([])
  })

  it('(b) полный refetch (новые данные без нового патча) — полный пересчёт', () => {
    const { result, rerender } = renderOrgData(tree)
    const first = result.current.aggregates!
    const untouchedDiv2 = first.get('div-2')

    mockQuery(patchTeamHeadcount(tree, 5))
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })
    expect(result.current.aggregates).toBe(first)

    // Refetch: сервер уже с пропатченными значениями — новый массив, seq не менялся.
    mockQuery(patchTeamHeadcount(tree, 5).map((n) => ({ ...n })))
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })

    expect(result.current.aggregates).not.toBe(first)
    expect(result.current.aggregates!.get('div-2')).not.toBe(untouchedDiv2)
    expect(result.current.changedCells).toEqual([])
    expect(result.current.aggregates!.get('team-1-1-1')!.totalHeadcount).toBe(5)
  })

  it('(d) после патча все агрегаты конечны (нет NaN)', () => {
    const { result, rerender } = renderOrgData(tree)

    mockQuery(patchTeamHeadcount(tree, 5))
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })

    for (const aggregate of result.current.aggregates!.values()) {
      expect(Number.isFinite(aggregate.totalHeadcount)).toBe(true)
      expect(Number.isFinite(aggregate.totalBudget)).toBe(true)
      expect(Number.isFinite(aggregate.weightedPerformance)).toBe(true)
    }
  })

  it('(StrictMode) патч остаётся инкрементальным при двойном рендере', () => {
    const { result, rerender } = renderOrgData(tree, { strict: true })
    const aggregates = result.current.aggregates!

    mockQuery(patchTeamHeadcount(tree, 5))
    rerender({ lastPatch: patchOf(1, 'team-1-1-1') })

    expect(result.current.aggregates).toBe(aggregates)
    expect(aggregates.get('team-1-1-1')!.totalHeadcount).toBe(5)
    expect(result.current.changedCells).toEqual([
      { nodeId: 'team-1-1-1', field: 'totalHeadcount' },
      { nodeId: 'dept-1-1', field: 'totalHeadcount' },
      { nodeId: 'div-1', field: 'totalHeadcount' },
    ])
  })
})
