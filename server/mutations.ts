// Чистая логика мутаций + планировщик. Транспорт (SSE) — в sse.ts.
// rng и время инъекцией: логика детерминированно тестируется без таймеров.

import type { OrgNode } from './org-data';

export const MUTABLE_FIELDS = ['headcount', 'budget', 'performance'] as const;
export type MutableField = (typeof MUTABLE_FIELDS)[number];

export interface Patch {
  id: string;
  changes: Partial<Pick<OrgNode, MutableField>>;
  updatedAt: string;
}

export type Rng = () => number;

// Правила мутации (кратко из брифа + допустимые границы данных):
// - headcount: ±1..3, но не ниже 1 (headcount > 0 по модели данных);
// - budget: ±1–10% от текущего, целое, не ниже 0 (бриф задаёт только «±»);
// - performance: ±1..10 (до ±10), clamp 0..100.

const MIN_HEADCOUNT = 1;
const BUDGET_SHARE_MIN = 0.01; // ±1 %
const BUDGET_SHARE_RANGE = 0.09; // до ±10 %
const PERFORMANCE_DELTA_MAX = 10;

export interface MutationLoopOptions {
  nodes: OrgNode[];
  /** Вызывается для каждого патча (транспорт подписчика получает его здесь). */
  onPatch: (patch: Patch) => void;
  rng?: Rng;
  minIntervalMs?: number; // 2000
  maxIntervalMs?: number; // 6000
}

function direction(rng: Rng): 1 | -1 {
  return rng() < 0.5 ? -1 : 1;
}

function nextValue(node: OrgNode, field: MutableField, rng: Rng): number {
  switch (field) {
    case 'headcount': {
      const delta = 1 + Math.floor(rng() * 3); // 1..3
      const value = node.headcount + direction(rng) * delta;
      return value < MIN_HEADCOUNT ? node.headcount + delta : value;
    }
    case 'budget': {
      const share = BUDGET_SHARE_MIN + rng() * BUDGET_SHARE_RANGE;
      return Math.max(0, Math.round(node.budget * (1 + direction(rng) * share)));
    }
    case 'performance': {
      const delta = 1 + Math.floor(rng() * PERFORMANCE_DELTA_MAX);
      return Math.min(100, Math.max(0, node.performance + direction(rng) * delta));
    }
  }
}

/** Выбирает случайный узел и мутирует 1–2 поля. Не изменяет входной массив. */
export function mutateRandomNode(
  nodes: OrgNode[],
  rng: Rng = Math.random,
  now: Date = new Date(),
): Patch | null {
  if (nodes.length === 0) return null;

  const node = nodes[Math.floor(rng() * nodes.length)];
  const fieldCount = 1 + Math.floor(rng() * 2); // 1–2 поля

  const pool = [...MUTABLE_FIELDS];
  const changes: Patch['changes'] = {};
  for (let i = 0; i < fieldCount; i++) {
    const field = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    changes[field] = nextValue(node, field, rng);
  }

  return { id: node.id, changes, updatedAt: now.toISOString() };
}

/** Применяет патч к общему состоянию; возвращает узел или null, если id неизвестен. */
export function applyPatch(nodes: OrgNode[], patch: Patch): OrgNode | null {
  const node = nodes.find((n) => n.id === patch.id);
  if (!node) return null;
  Object.assign(node, patch.changes);
  node.updatedAt = patch.updatedAt;
  return node;
}

/** Планировщик: патч каждые 2–6 с (случайный интервал). Возвращает stop(). */
export function startMutationLoop(options: MutationLoopOptions): () => void {
  const {
    nodes,
    onPatch,
    rng = Math.random,
    minIntervalMs = 2_000,
    maxIntervalMs = 6_000,
  } = options;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;

  const schedule = () => {
    timer = setTimeout(
      () => {
        const patch = mutateRandomNode(nodes, rng);
        if (patch) {
          applyPatch(nodes, patch);
          onPatch(patch);
        }
        if (!stopped) schedule();
      },
      minIntervalMs + rng() * (maxIntervalMs - minIntervalMs),
    );
  };

  schedule();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
