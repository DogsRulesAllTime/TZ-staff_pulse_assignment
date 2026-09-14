import { describe, expect, it } from 'vitest'
import { buildForest, DataError, defaultExpandedIds } from './tree'
import { node, type NodeInput } from '@/test/factories'

/** 1 дивизион → 2 отдела → 2 команды. */
const fixture: NodeInput[] = [
  node({ id: 'div-1', name: 'Дивизион 1', headcount: 100 }),
  node({ id: 'dept-1-1', name: 'Отдел 1.1', parentId: 'div-1', headcount: 40 }),
  node({ id: 'dept-1-2', name: 'Отдел 1.2', parentId: 'div-1', headcount: 60 }),
  node({ id: 'team-1-1-1', name: 'Команда 1.1.1', parentId: 'dept-1-1', headcount: 10 }),
  node({ id: 'team-1-2-1', name: 'Команда 1.2.1', parentId: 'dept-1-2', headcount: 20 }),
]

describe('buildForest', () => {
  it('builds a Forest with correct roots, children and depths from 5 nodes', () => {
    const forest = buildForest(fixture)

    expect(forest.byId.size).toBe(5)
    expect([...forest.byId.keys()]).toEqual([
      'div-1',
      'dept-1-1',
      'dept-1-2',
      'team-1-1-1',
      'team-1-2-1',
    ])

    expect(forest.roots.map((root) => root.id)).toEqual(['div-1'])

    const division = forest.byId.get('div-1')!
    expect(division.depth).toBe(0)
    expect(division.children.map((child) => child.id)).toEqual(['dept-1-1', 'dept-1-2'])

    const firstDept = forest.byId.get('dept-1-1')!
    expect(firstDept.depth).toBe(1)
    expect(firstDept.children.map((child) => child.id)).toEqual(['team-1-1-1'])

    const firstTeam = forest.byId.get('team-1-1-1')!
    expect(firstTeam.depth).toBe(2)
    expect(firstTeam.children).toEqual([])

    expect(forest.byId.get('dept-1-2')!.depth).toBe(1)
    expect(forest.byId.get('team-1-2-1')!.depth).toBe(2)

    expect(forest.parentOf.get('div-1')).toBeNull()
    expect(forest.parentOf.get('dept-1-1')).toBe('div-1')
    expect(forest.parentOf.get('team-1-1-1')).toBe('dept-1-1')
  })

  it('throws DataError when a parentId references a missing node', () => {
    const broken: NodeInput[] = [
      node({ id: 'div-1' }),
      node({ id: 'dept-1-1', parentId: 'ghost' }),
    ]

    expect(() => buildForest(broken)).toThrow(DataError)
    expect(() => buildForest(broken)).toThrow(/ghost/)
  })

  it('throws DataError when nodes form a cycle', () => {
    const cyclic: NodeInput[] = [
      node({ id: 'a', parentId: 'c' }),
      node({ id: 'b', parentId: 'a' }),
      node({ id: 'c', parentId: 'b' }),
    ]

    expect(() => buildForest(cyclic)).toThrow(DataError)
    expect(() => buildForest(cyclic)).toThrow(/цикл|cycle/i)
  })

  it('throws DataError for a self-referencing node', () => {
    expect(() => buildForest([node({ id: 'a', parentId: 'a' })])).toThrow(DataError)
  })

  it('builds multiple roots for a multi-division forest', () => {
    const forest = buildForest([
      node({ id: 'div-1' }),
      node({ id: 'div-2' }),
      node({ id: 'dept-2-1', parentId: 'div-2' }),
    ])

    expect(forest.roots.map((root) => root.id)).toEqual(['div-1', 'div-2'])
  })
})

describe('defaultExpandedIds', () => {
  it('returns ids of nodes with depth <= 1', () => {
    const forest = buildForest(fixture)

    expect([...defaultExpandedIds(forest)]).toEqual(['div-1', 'dept-1-1', 'dept-1-2'])
  })
})
