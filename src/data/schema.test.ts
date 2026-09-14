// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { orgNodeSchema, orgTreeSchema, type OrgNode } from './schema';

const validNode = {
  id: 'node-1',
  name: 'Engineering',
  parentId: null,
  headcount: 12,
  budget: 1500,
  performance: 74.5,
  updatedAt: '2026-02-11T10:00:00.000Z',
};

describe('orgNodeSchema', () => {
  it('accepts a valid node', () => {
    expect(orgNodeSchema.parse(validNode)).toEqual(validNode);
  });

  it('rejects performance above 100', () => {
    expect(() => orgNodeSchema.parse({ ...validNode, performance: 150 })).toThrow();
  });

  it('rejects negative headcount', () => {
    expect(() => orgNodeSchema.parse({ ...validNode, headcount: -1 })).toThrow();
  });

  it('rejects missing name', () => {
    const { name: _name, ...withoutName } = validNode;
    expect(() => orgNodeSchema.parse(withoutName)).toThrow();
  });

  it('rejects empty-string id', () => {
    expect(() => orgNodeSchema.parse({ ...validNode, id: '' })).toThrow();
  });

  it('rejects empty-string name', () => {
    expect(() => orgNodeSchema.parse({ ...validNode, name: '' })).toThrow();
  });

  it('rejects non-ISO updatedAt', () => {
    expect(() => orgNodeSchema.parse({ ...validNode, updatedAt: 'yesterday' })).toThrow();
  });
});

describe('orgTreeSchema', () => {
  it('accepts an empty array (valid response)', () => {
    expect(orgTreeSchema.parse([])).toEqual([]);
  });

  it('accepts a list of valid nodes', () => {
    const tree: OrgNode[] = [validNode, { ...validNode, id: 'node-2', parentId: 'node-1' }];
    expect(orgTreeSchema.parse(tree)).toEqual(tree);
  });

  it('rejects when any node is invalid', () => {
    expect(() => orgTreeSchema.parse([validNode, { ...validNode, budget: -5 }])).toThrow();
  });
});
