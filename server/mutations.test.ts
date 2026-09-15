// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPatch, mutateRandomNode, startMutationLoop, type Patch } from './mutations';
import type { OrgNode } from './org-data';

function makeNode(overrides: Partial<OrgNode> = {}): OrgNode {
  return {
    id: 'n-1',
    name: 'Тестовый узел',
    parentId: null,
    headcount: 10,
    budget: 1_000_000,
    performance: 50,
    updatedAt: '2025-01-06T09:00:00.000Z',
    ...overrides,
  };
}

describe('mutateRandomNode', () => {
  it('возвращает null для пустого списка узлов', () => {
    expect(mutateRandomNode([], Math.random)).toBeNull();
  });

  it('патч ссылается на существующий узел и содержит 1–2 изменённых поля', () => {
    const nodes = [makeNode(), makeNode({ id: 'n-2' })];
    for (let i = 0; i < 100; i++) {
      const patch = mutateRandomNode(nodes, Math.random);
      expect(patch).not.toBeNull();
      const keys = Object.keys(patch!.changes);
      expect(patch!.id === 'n-1' || patch!.id === 'n-2').toBe(true);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      expect(keys.length).toBeLessThanOrEqual(2);
      for (const key of keys) {
        expect(['headcount', 'budget', 'performance']).toContain(key);
      }
    }
  });

  it('updatedAt — валидный ISO-8601', () => {
    const patch = mutateRandomNode([makeNode()], Math.random);
    expect(Number.isNaN(Date.parse(patch!.updatedAt))).toBe(false);
  });

  it('headcount после мутации остаётся > 0, дельта в пределах ±3', () => {
    const nodes = [makeNode({ headcount: 1 })];
    for (let i = 0; i < 200; i++) {
      const patch = mutateRandomNode(nodes, Math.random);
      if (patch?.changes.headcount === undefined) continue;
      expect(patch.changes.headcount).toBeGreaterThanOrEqual(1);
      expect(Math.abs(patch.changes.headcount - 1)).toBeLessThanOrEqual(3);
    }
  });

  it('performance зажимается в 0..100', () => {
    for (const performance of [0, 2, 98, 100]) {
      const nodes = [makeNode({ performance })];
      for (let i = 0; i < 200; i++) {
        const patch = mutateRandomNode(nodes, Math.random);
        if (patch?.changes.performance === undefined) continue;
        expect(patch.changes.performance).toBeGreaterThanOrEqual(0);
        expect(patch.changes.performance).toBeLessThanOrEqual(100);
      }
    }
  });

  it('budget остаётся целым и не уходит в минус', () => {
    const nodes = [makeNode({ budget: 100_000 })];
    for (let i = 0; i < 200; i++) {
      const patch = mutateRandomNode(nodes, Math.random);
      if (patch?.changes.budget === undefined) continue;
      expect(patch.changes.budget).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(patch.changes.budget)).toBe(true);
    }
  });
});

describe('applyPatch', () => {
  it('применяет изменения к узлу и обновляет updatedAt', () => {
    const nodes = [makeNode({ id: 'n-1' })];
    const patch = {
      id: 'n-1',
      changes: { headcount: 12, performance: 66 },
      updatedAt: '2025-06-01T12:00:00.000Z',
    };
    applyPatch(nodes, patch);
    expect(nodes[0].headcount).toBe(12);
    expect(nodes[0].performance).toBe(66);
    expect(nodes[0].updatedAt).toBe('2025-06-01T12:00:00.000Z');
  });

  it('возвращает null, если узел не найден', () => {
    const nodes = [makeNode()];
    expect(applyPatch(nodes, { id: 'nope', changes: { headcount: 5 }, updatedAt: 'x' })).toBeNull();
    expect(nodes[0].headcount).toBe(10);
  });
});

describe('startMutationLoop', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('генерирует патчи по расписанию и останавливается по stop()', () => {
    vi.useFakeTimers();
    const nodes = [makeNode(), makeNode({ id: 'n-2', parentId: 'n-1' })];
    const onPatch = vi.fn<(patch: Patch) => void>();
    // rng = () => 0.3 → интервал 2000 + 0.3 * 4000 = 3200 мс
    const stop = startMutationLoop({ nodes, onPatch, rng: () => 0.3 });

    vi.advanceTimersByTime(3199);
    expect(onPatch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0].id).toBe('n-1');

    vi.advanceTimersByTime(6400);
    expect(onPatch).toHaveBeenCalledTimes(3);

    stop();
    vi.advanceTimersByTime(60_000);
    expect(onPatch).toHaveBeenCalledTimes(3);
  });
});
