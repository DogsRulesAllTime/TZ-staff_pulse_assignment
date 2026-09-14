import type { OrgNode, Patch } from '@/data/schema'

/**
 * Чистое применение SSE-патча к плоскому массиву узлов (содержимое кеша
 * ORG_TREE_KEY). Возвращает НОВЫЙ массив, в котором заменён только узел
 * с `patch.id`: переписываются поля из `patch.changes` и `updatedAt`.
 * - неизвестный id → возвращается тот же экземпляр массива (identity);
 * - узлы вне патча сохраняют ссылочную идентичность (структурное шаринг,
 *   чтобы React/мемоизация видели «не изменилось»);
 * - вход не мутируется.
 *
 * Агрегаты здесь НЕ пересчитываются — это делает `recomputeBranch`
 * (Task 8) поверх нового массива.
 */
export function applyPatch(nodes: OrgNode[], patch: Patch): OrgNode[] {
  const index = nodes.findIndex((candidate) => candidate.id === patch.id)
  if (index === -1) {
    return nodes
  }

  const next = nodes.slice()
  next[index] = { ...nodes[index], ...patch.changes, updatedAt: patch.updatedAt }
  return next
}
