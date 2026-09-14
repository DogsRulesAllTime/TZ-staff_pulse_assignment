import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrgData } from './useOrgData'
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
