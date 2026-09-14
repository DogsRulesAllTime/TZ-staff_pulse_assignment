import { describe, expect, it } from 'vitest'
import { patchSchema } from '@/data/schema'
import { node } from '@/test/factories'
import { buildForest } from '@/domain/tree'
import { applyPatch } from './patch'

const UPDATED_AT = '2025-06-01T12:00:00.000Z'

function makePatch(id: string, changes: Record<string, unknown>, updatedAt = UPDATED_AT) {
  return patchSchema.parse({ id, changes, updatedAt })
}

describe('applyPatch', () => {
  const tree = [
    node({ id: 'root' }),
    node({ id: 'child', parentId: 'root', headcount: 10, budget: 5000, performance: 50 }),
    node({ id: 'grandchild', parentId: 'child', headcount: 3, budget: 100, performance: 99 }),
  ]
  const forest = buildForest(tree)

  it('replaces only the fields listed in changes plus updatedAt', () => {
    const patched = applyPatch(tree, makePatch('child', { budget: 42 }))

    expect(patched[1]).toEqual({
      id: 'child',
      name: 'child',
      parentId: 'root',
      headcount: 10,
      budget: 42,
      performance: 50,
      updatedAt: UPDATED_AT,
    })
  })

  it('applies multiple fields in one patch', () => {
    const patched = applyPatch(tree, makePatch('child', { headcount: 7, performance: 100 }))

    expect(patched[1].headcount).toBe(7)
    expect(patched[1].performance).toBe(100)
    expect(patched[1].budget).toBe(5000) // не указан в changes — не тронут
    expect(patched[1].updatedAt).toBe(UPDATED_AT)
  })

  it('returns a NEW array and a NEW node object (input is not mutated)', () => {
    const snapshot = structuredClone(tree)

    const patched = applyPatch(tree, makePatch('child', { budget: 1 }))

    expect(patched).not.toBe(tree)
    expect(patched[1]).not.toBe(tree[1])
    expect(tree).toEqual(snapshot)
  })

  it('preserves identity of the array and untouched nodes when id is unknown', () => {
    const patched = applyPatch(tree, makePatch('nope', { budget: 1 }))

    expect(patched).toBe(tree)
    expect(patched[1]).toBe(tree[1])
   })

  it('preserves identity of untouched sibling nodes', () => {
    const patched = applyPatch(tree, makePatch('child', { budget: 2 }))

    expect(patched[0]).toBe(tree[0])
    expect(patched[2]).toBe(tree[2])
  })

  it('rejects an invalid payload at the schema level', () => {
    // пустые changes
    expect(() => patchSchema.parse({ id: 'x', changes: {}, updatedAt: UPDATED_AT })).toThrow()
    // отрицательный budget
    expect(() => patchSchema.parse({ id: 'x', changes: { budget: -1 }, updatedAt: UPDATED_AT })).toThrow()
    // некорректный updatedAt
    expect(() => patchSchema.parse({ id: 'x', changes: { budget: 1 }, updatedAt: 'yesterday' })).toThrow()
    // пустой id
    expect(() => patchSchema.parse({ id: '', changes: { budget: 1 }, updatedAt: UPDATED_AT })).toThrow()
  })

  it('patches work on forest-backed flat arrays (data contract: query cache holds OrgNode[])', () => {
    const patched = applyPatch(tree, makePatch('grandchild', { headcount: 1 }))
    expect(patched[2].headcount).toBe(1)
    expect(forest.byId.get('grandchild')?.headcount).toBe(3) // лес не мутирован
  })
})
