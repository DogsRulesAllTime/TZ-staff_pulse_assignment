/**
 * Pure aggregation domain — no React, no data-layer or component imports.
 *
 * `aggregateForest` computes per-node subtree aggregates in one post-order DFS.
 * `recomputeBranch` is the memoized update: given a cache Map and the ids of
 * nodes whose own values changed, it recomputes only the affected branch —
 * each changed node, all of its descendants (their cached values may be stale
 * relative to freshly patched data), and every ancestor up to the roots.
 * Untouched entries keep their object identity, so consumers can memoize on it.
 */
import type { Forest, TreeNode } from './tree'

export interface Aggregates {
  totalHeadcount: number
  totalBudget: number
  weightedPerformance: number
}

/**
 * Builds one node's aggregates from its own values and its children's
 * already-computed aggregates. `weightedPerformance` accumulates as the pair
 * (Σ perfᵢ·headcountᵢ, Σ headcountᵢ); headcount > 0 is a domain invariant, so
 * the zero-guard only fires for hand-crafted degenerate forests — returns 0
 * instead of NaN.
 */
function computeAggregates(node: TreeNode, children: readonly Aggregates[]): Aggregates {
  let totalHeadcount = node.headcount
  let totalBudget = node.budget
  let weightedPerfSum = node.headcount * node.performance

  for (const child of children) {
    totalHeadcount += child.totalHeadcount
    totalBudget += child.totalBudget
    weightedPerfSum += child.weightedPerformance * child.totalHeadcount
  }

  return {
    totalHeadcount,
    totalBudget,
    weightedPerformance: totalHeadcount === 0 ? 0 : weightedPerfSum / totalHeadcount,
  }
}

/**
 * Full aggregate pass: one post-order DFS over the roots, O(n).
 * Islands not reachable from `forest.roots` get no entry (graceful degradation).
 */
export function aggregateForest(forest: Forest): Map<string, Aggregates> {
  const aggregates = new Map<string, Aggregates>()

  const visit = (node: TreeNode): Aggregates => {
    const childAggregates = node.children.map(visit)
    const aggregate = computeAggregates(node, childAggregates)
    aggregates.set(node.id, aggregate)
    return aggregate
  }
  for (const root of forest.roots) {
    visit(root)
  }

  return aggregates
}

/**
 * In-place memoized recompute.
 *
 * Contract: MUTATES the passed `aggregates` Map and returns the same instance.
 * Recompute set = union of, for every changed id: the node itself, all of its
 * descendants, and its root-path ancestors. Nodes are recomputed deepest-first,
 * so a changed descendant's fresh values flow up through its ancestors; nodes
 * outside the set keep their aggregate object identity.
 * Unknown ids are ignored (no crash). Only affected branches are touched —
 * O(changed subtree size + the depth sort over the dirty set).
 */
export function recomputeBranch(
  forest: Forest,
  aggregates: Map<string, Aggregates>,
  changedNodeIds: readonly string[],
): Map<string, Aggregates> {
  const dirty = new Set<string>()

  for (const id of changedNodeIds) {
    const start = forest.byId.get(id)
    if (!start) {
      continue
    }
    // The changed node and everything below it.
    const stack: TreeNode[] = [start]
    while (stack.length > 0) {
      const current = stack.pop()!
      dirty.add(current.id)
      for (const child of current.children) {
        stack.push(child)
      }
    }
    // …and every ancestor up to the root.
    let cursor: string | null = id
    while (cursor !== null) {
      dirty.add(cursor)
      cursor = forest.parentOf.get(cursor) ?? null
    }
  }

  // Deepest first: children are recomputed before their parents read them.
  const ordered = [...dirty]
    .map((id) => forest.byId.get(id)!)
    .sort((a, b) => b.depth - a.depth)

  for (const node of ordered) {
    const childAggregates: Aggregates[] = []
    for (const child of node.children) {
      const cached = aggregates.get(child.id)
      if (cached) {
        childAggregates.push(cached)
      }
    }
    aggregates.set(node.id, computeAggregates(node, childAggregates))
  }

  return aggregates
}
