import type { TreeNode, TreeNodeInput } from '@/domain/tree';

type NodeInput = Omit<TreeNode, 'children' | 'depth'>;

/**
 * Единственный тест-фабричный хелпер узла орг-структуры (вынесен из
 * дублированных определений в тестах Task 4/5 — Task 6).
 * Заполняет валидные дефолты по схеме: name = id, корень (parentId: null),
 * headcount 1, budget 1000 руб., performance 80.
 */
export function node(partial: Partial<NodeInput> & Pick<NodeInput, 'id'>): TreeNodeInput {
  return {
    name: partial.id,
    parentId: null,
    headcount: 1,
    budget: 1000,
    performance: 80,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...partial,
  };
}

export type { NodeInput, TreeNodeInput };
