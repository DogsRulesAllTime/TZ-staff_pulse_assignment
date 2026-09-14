/**
 * Pure tree domain — no React, no data-layer or component imports.
 * Input nodes are structural: any payload shaped like the API node works.
 */

export type TreeNodeInput = Omit<TreeNode, 'children' | 'depth'>

export interface TreeNode {
  id: string
  name: string
  parentId: string | null
  headcount: number
  budget: number
  performance: number
  updatedAt: string
  children: TreeNode[]
  /** 0 = дивизион, 1 = отдел, 2 = команда. */
  depth: number
}

export interface Forest {
  byId: Map<string, TreeNode>
  roots: TreeNode[]
  /** Быстрый подъём к предкам: id → parentId. */
  parentOf: Map<string, string | null>
}

/** Invalid payload structure (dangling references, cycles) — maps to the UI Error state. */
export class DataError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'DataError'
  }
}

/**
 * Builds a Forest from a flat node list in O(n) using Maps:
 * pass 1 creates nodes + lookup maps, pass 2 links children, pass 3 assigns
 * depths from the roots (unvisited remainder ⇒ cycle).
 */
export function buildForest(nodes: readonly TreeNodeInput[]): Forest {
  const byId = new Map<string, TreeNode>()
  const parentOf = new Map<string, string | null>()

  for (const input of nodes) {
    if (byId.has(input.id)) {
      throw new DataError(`Duplicate node id: ${input.id}`)
    }
    byId.set(input.id, { ...input, children: [], depth: 0 })
    parentOf.set(input.id, input.parentId)
  }

  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node)
      continue
    }
    const parent = byId.get(node.parentId)
    if (!parent) {
      throw new DataError(`Node "${node.id}" references missing parent "${node.parentId}"`)
    }
    parent.children.push(node)
  }

  let visited = 0
  const visit = (node: TreeNode, depth: number): void => {
    visited += 1
    node.depth = depth
    for (const child of node.children) {
      visit(child, depth + 1)
    }
  }
  for (const root of roots) {
    visit(root, 0)
  }

  if (visited !== byId.size) {
    throw new DataError(
      `Cycle detected in org tree: ${byId.size - visited} node(s) unreachable from roots`,
    )
  }

  return { byId, roots, parentOf }
}

/** Default expansion: все узлы depth <= 1 (второй уровень открыт). */
export function defaultExpandedIds(forest: Forest): Set<string> {
  const expanded = new Set<string>()
  for (const node of forest.byId.values()) {
    if (node.depth <= 1) {
      expanded.add(node.id)
    }
  }
  return expanded
}
