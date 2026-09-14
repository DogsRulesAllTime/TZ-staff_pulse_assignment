import { describe, expect, it } from 'vitest';
import { buildForest, type TreeNode } from './tree';
import { matchesFilter } from './filter';
import { node, type NodeInput } from '@/test/factories';

/** 1 дивизион → 2 отдела → 2 команды (та же форма, что в tree.test.ts). */
const fixture: NodeInput[] = [
  node({ id: 'div-1', name: 'Дивизион Запад' }),
  node({ id: 'dept-1-1', name: 'Отдел разработки', parentId: 'div-1' }),
  node({ id: 'dept-1-2', name: 'Отдел продаж', parentId: 'div-1' }),
  node({ id: 'team-1-1-1', name: 'Команда Платформа', parentId: 'dept-1-1' }),
  node({ id: 'team-1-2-1', name: 'Команда Хантеры', parentId: 'dept-1-2' }),
];

function nodes(): TreeNode[] {
  return [...buildForest(fixture).byId.values()];
}

function visibleIds(query: string): string[] {
  return matchesFilter(nodes(), query).map((n) => n.id);
}

describe('matchesFilter', () => {
  it('returns all nodes for an empty/whitespace query', () => {
    expect(visibleIds('')).toHaveLength(5);
    expect(visibleIds('   ')).toHaveLength(5);
  });

  it('matches substring case-insensitively (кириллица и латиница)', () => {
    // Совпавший отдел виден вместе со своим дивизионом (поддерево дивизиона содержит совпадение).
    expect(visibleIds('разработ')).toEqual(['div-1', 'dept-1-1']);
    expect(visibleIds('ЗАПАД')).toEqual(['div-1']);
    expect(visibleIds('хантер')).toEqual(['div-1', 'dept-1-2', 'team-1-2-1']);
  });

  it('keeps the ancestor row when only a descendant matches (фильтр по поддереву)', () => {
    // «Платформа» — имя команды; её отдел и дивизион остаются видимыми.
    expect(visibleIds('платформа')).toEqual(['div-1', 'dept-1-1', 'team-1-1-1']);
  });

  it('excludes nodes with no match in their own name or any descendant', () => {
    expect(visibleIds('платформа')).not.toContain('dept-1-2');
    expect(visibleIds('платформа')).not.toContain('team-1-2-1');
    expect(visibleIds('нет-такого')).toEqual([]);
  });

  it('excludes descendants whose own subtree has no match, even under a matched node', () => {
    // «Продаж» совпадает с отделом, но команда «Хантеры» — нет: её строка скрывается.
    expect(visibleIds('продаж')).toEqual(['div-1', 'dept-1-2']);
  });
});
