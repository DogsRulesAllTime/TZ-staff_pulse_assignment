// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildOrgTree } from './org-data'
import type { OrgNode } from './org-data'

function byIdMap(nodes: OrgNode[]): Map<string, OrgNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

/** Глубина узла в цепочке parentId (0 — корень-дивизион). */
function depthOf(node: OrgNode, byId: Map<string, OrgNode>): number {
  let depth = 0
  let current: OrgNode | undefined = node
  while (current && current.parentId !== null) {
    depth++
    current = byId.get(current.parentId)
  }
  return depth
}

describe('buildOrgTree', () => {
  const nodes = buildOrgTree()

  it('возвращает ≥ 40 узлов', () => {
    expect(nodes.length).toBeGreaterThanOrEqual(40)
  })

  it('имеет глубину ≥ 2 (дивизион → отдел → команда)', () => {
    const byId = byIdMap(nodes)
    const maxDepth = Math.max(...nodes.map((n) => depthOf(n, byId)))
    expect(maxDepth).toBeGreaterThanOrEqual(2)
  })

  it('parentId ссылается только на существующие id (или null)', () => {
    const ids = new Set(nodes.map((n) => n.id))
    expect(ids.size).toBe(nodes.length) // id уникальны
    for (const node of nodes) {
      if (node.parentId === null) continue
      expect(ids.has(node.parentId), `узел ${node.id} ссылается на неизвестный ${node.parentId}`).toBe(true)
    }
  })

  it('имеет хотя бы один корень', () => {
    const roots = nodes.filter((n) => n.parentId === null)
    expect(roots.length).toBeGreaterThanOrEqual(1)
  })

  it('детерминирован: два вызова дают идентичные данные', () => {
    expect(buildOrgTree()).toEqual(nodes)
  })

  it('значения в заданных диапазонах: headcount 3–60, budget 100 000–50 000 000, performance 10–99', () => {
    for (const node of nodes) {
      expect(node.headcount).toBeGreaterThanOrEqual(3)
      expect(node.headcount).toBeLessThanOrEqual(60)
      expect(node.budget).toBeGreaterThanOrEqual(100_000)
      expect(node.budget).toBeLessThanOrEqual(50_000_000)
      expect(Number.isInteger(node.budget)).toBe(true)
      expect(node.performance).toBeGreaterThanOrEqual(10)
      expect(node.performance).toBeLessThanOrEqual(99)
    }
  })

  it('структура: 4 дивизиона, у каждого 2–3 отдела, у отдела 2–3 команды', () => {
    const byId = byIdMap(nodes)
    const roots = nodes.filter((n) => n.parentId === null)
    expect(roots).toHaveLength(4)

    for (const division of roots) {
      const departments = nodes.filter((n) => n.parentId === division.id)
      expect(departments.length).toBeGreaterThanOrEqual(2)
      expect(departments.length).toBeLessThanOrEqual(3)

      for (const department of departments) {
        const teams = nodes.filter((n) => n.parentId === department.id)
        expect(teams.length).toBeGreaterThanOrEqual(2)
        expect(teams.length).toBeLessThanOrEqual(3)
        for (const team of teams) {
          expect(depthOf(team, byId)).toBe(2)
        }
      }
    }
  })
})
