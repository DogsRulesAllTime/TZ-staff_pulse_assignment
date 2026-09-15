import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectSse, type SseStatus } from './sse';
import type { Patch } from './schema';

type Listener = (event: { data?: string }) => void;

/**
 * Управляемый фейк EventSource: тесты программно дёргают open/error/patch.
 * Экземпляры складываются в MockEventSource.created для инспекции из теста.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  static reset() {
    MockEventSource.instances = [];
  }

  readonly url: string;
  closed = false;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close() {
    this.closed = true;
  }

  emit(type: 'open' | 'error', data?: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  emitPatch(data: unknown) {
    for (const listener of this.listeners.get('patch') ?? []) {
      listener({ data: typeof data === 'string' ? data : JSON.stringify(data) });
    }
  }

  get opened() {
    return !this.closed;
  }
}

const PATCH_RAW = {
  id: 'team-4-2-2',
  changes: { budget: 8664402 },
  updatedAt: '2025-06-01T12:00:00.000Z',
};

describe('connectSse (SSE-транспорт с backoff-reconnect)', () => {
  let statuses: SseStatus[];
  let patches: unknown[];
  let rng: () => number;

  const connect = () =>
    connectSse({
      url: '/api/events',
      eventSourceFactory: (url) => new MockEventSource(url),
      rng: () => rng(),
      onStatus: (status) => statuses.push(status),
      onPatch: (patch) => patches.push(patch),
    });

  const last = () => MockEventSource.instances[MockEventSource.instances.length - 1];

  beforeEach(() => {
    vi.useFakeTimers();
    MockEventSource.reset();
    statuses = [];
    patches = [];
    rng = () => 0.5; // jitter-фактор ровно 1.0 → базовые задержки 1с/2с/4с…
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates EventSource against the given relative URL and reports connecting', () => {
    connect();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(last().url).toBe('/api/events');
    expect(statuses).toEqual(['connecting']);
  });

  it('open → online', () => {
    connect();
    last().emit('open');

    expect(statuses).toEqual(['connecting', 'online']);
  });

  it('error → offline, reconnect after exactly the base delay (jitter = 1.0 here)', () => {
    connect();
    last().emit('error');

    expect(statuses).toEqual(['connecting', 'offline']);
    expect(MockEventSource.instances).toHaveLength(1); // ещё не переподключились

    vi.advanceTimersByTime(999);
    expect(MockEventSource.instances).toHaveLength(1); // рано

    vi.advanceTimersByTime(1);
    expect(MockEventSource.instances).toHaveLength(2); // reconnect через 1с
    expect(statuses.at(-1)).toBe('connecting');
  });

  it('jitter keeps delay within [0.7t, 1.3t] for rng extremes', () => {
    const delays: number[] = [];
    for (const value of [0, 1]) {
      MockEventSource.reset();
      rng = () => value; // фактор 0.7 при 0, фактор 1.3 при 1
      connect();
      const base = MockEventSource.instances.length;
      last().emit('error');
      let elapsed = 0;
      while (MockEventSource.instances.length === base && elapsed < 3000) {
        vi.advanceTimersByTime(1);
        elapsed += 1;
      }
      delays.push(elapsed);
    }
    expect(delays[0]).toBeGreaterThanOrEqual(0.7 * 1000);
    expect(delays[0]).toBeLessThanOrEqual(1.3 * 1000);
    expect(delays[1]).toBeGreaterThanOrEqual(0.7 * 1000);
    expect(delays[1]).toBeLessThanOrEqual(1.3 * 1000);
  });

  it('repeated failures back off 2s, 4s… capped at 16s', () => {
    connect();

    const fail = () => {
      const before = MockEventSource.instances.length;
      last().emit('error');
      let elapsed = 0;
      while (MockEventSource.instances.length === before && elapsed < 30_000) {
        vi.advanceTimersByTime(100);
        elapsed += 100;
      }
      return elapsed;
    };

    fail(); // 1s
    expect(fail()).toBe(2000);
    expect(fail()).toBe(4000);
    expect(fail()).toBe(8000);
    expect(fail()).toBe(16_000);
    expect(fail()).toBe(16_000); // cap, не растёт дальше
  });

  it('successful reconnect resets the backoff to the initial delay', () => {
    connect();
    const first = last();
    first.emit('error');
    vi.advanceTimersByTime(1000); // reconnect №2 после 1с
    expect(MockEventSource.instances).toHaveLength(2);

    last().emit('error');
    vi.advanceTimersByTime(2000); // reconnect №3 после 2с
    expect(MockEventSource.instances).toHaveLength(3);

    last().emit('open'); // успех — backoff сбрасывается
    last().emit('error');

    let elapsed = 0;
    while (MockEventSource.instances.length === 3 && elapsed < 30_000) {
      vi.advanceTimersByTime(100);
      elapsed += 100;
    }
    expect(elapsed).toBe(1000); // снова базовая 1с, а не 4-я степень
  });

  it('patch message → parsed patch passed to onPatch, no refetch', () => {
    const onPatch = vi.fn<(patch: Patch) => void>();
    const conn = connectSse({
      url: '/api/events',
      eventSourceFactory: (url) => new MockEventSource(url),
      rng,
      onStatus: () => {},
      onPatch,
    });

    last().emitPatch(PATCH_RAW);

    expect(onPatch).toHaveBeenCalledExactlyOnceWith(PATCH_RAW);
    conn.close();
  });

  it('invalid payload is ignored: callback not invoked, no crash, connection stays open', () => {
    const onPatch = vi.fn<(patch: Patch) => void>();
    const conn = connectSse({
      url: '/api/events',
      eventSourceFactory: (url) => new MockEventSource(url),
      rng,
      onStatus: () => {},
      onPatch,
    });
    const es = last();

    es.emitPatch({ id: 'x', changes: {}, updatedAt: '2025-06-01T12:00:00.000Z' }); // пустые changes
    es.emitPatch({ id: 'x', changes: { budget: -5 }, updatedAt: '2025-06-01T12:00:00.000Z' });
    es.emitPatch('not json at all');

    expect(onPatch).not.toHaveBeenCalled();
    expect(es.closed).toBe(false);
    conn.close();
  });

  it('close(): EventSource closed and pending reconnect timer cleared', () => {
    const conn = connect();
    const es = last();
    es.emit('error'); // запланирован reconnect

    conn.close();
    expect(es.closed).toBe(true);

    const count = MockEventSource.instances.length;
    vi.advanceTimersByTime(60_000);
    expect(MockEventSource.instances).toHaveLength(count); // таймер сброшен
  });
});
