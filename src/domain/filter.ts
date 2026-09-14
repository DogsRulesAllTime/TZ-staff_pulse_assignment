/**
 * Pure filter domain — no React, no data-layer or component imports.
 *
 * Семантика фильтра по имени (docs/architecture.md, data-model): строка
 * таблицы видна, если имя узла ИЛИ имя ЛЮБОГО его потомка содержит запрос
 * как подстроку без учёта регистра. Агрегаты при фильтре НЕ пересчитываются —
 * показываются полные агрегаты поддерева узла.
 */
import type { TreeNode } from './tree'

/** Substring + case-insensitive match по одному имени. */
function nameMatches(name: string, query: string): boolean {
  return name.toLowerCase().includes(query)
}

/**
 * Подходит ли узел под запрос: его имя или имя любого потомка содержит
 * подстроку `query`. Пустой/состоящий из пробелов запрос проходит мимо
 * сравнения (все узлы совпадают).
 */
export function nodeMatchesFilter(node: TreeNode, query: string): boolean {
  const trimmed = query.trim()
  if (trimmed === '') {
    return true
  }
  const needle = trimmed.toLowerCase()
  if (nameMatches(node.name, needle)) {
    return true
  }
  return node.children.some((child) => nodeMatchesFilter(child, needle))
}

/**
 * Фильтрует список узлов: оставляет те, чьё поддерево (узел + потомки)
 * содержит совпадение по имени. Порядок входных узлов сохраняется.
 */
export function matchesFilter<T extends TreeNode>(nodes: readonly T[], query: string): T[] {
  return nodes.filter((node) => nodeMatchesFilter(node, query))
}
