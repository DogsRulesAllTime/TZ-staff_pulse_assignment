import { patchSchema, type Patch } from './schema';

/** Состояние SSE-соединения для UI (ConnectionBadge). */
export type SseStatus = 'connecting' | 'online' | 'offline';

/** Минимальный интерфейс EventSource, достаточный транспорту (инъектится в тестах). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
}

export interface SseOptions {
  /** Относительный URL: '/api/events' — через vite-прокси (потом nginx). */
  url: string;
  onStatus: (status: SseStatus) => void;
  onPatch: (patch: Patch) => void;
  /** Фабрика соединения; по умолчанию — глобальный EventSource. */
  eventSourceFactory?: (url: string) => EventSourceLike;
  /**
   * Источник случайности для jitter — рационально [0,1). В проде —
   * Math.random; в тестах подставляется детерминированный rng, поэтому
   * в логике под тестом нет голого Math.random.
   */
  rng?: () => number;
}

const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 16_000;
const JITTER_SPREAD = 0.6; // множитель равномерно в [0.7, 1.3]

/**
 * SSE-транспорт `/api/events` с backoff-переподключением:
 * задержки 1с, 2с, 4с… до 16с (cap), каждая умножается на jitter-фактор
 * из [0.7, 1.3]; успешное открытие сбрасывает backoff на начальный.
 * `patch` события валидируются patchSchema: валидные уходят в onPatch,
 * невалидные молча игнорируются (соединение не рвётся).
 *
 * Транспорт не знает ни про React, ни про кеш — только статусы и патчи.
 * Возвращает handle с close(): закрыть EventSource и отменить таймер.
 */
export function connectSse(options: SseOptions): { close: () => void } {
  const factory = options.eventSourceFactory ?? ((url: string) => new EventSource(url));
  const rng = options.rng ?? Math.random;

  let closed = false;
  let failures = 0; // подряд идущие неудачи с последнего успешного открытия
  let eventSource: EventSourceLike | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const jittered = (base: number): number => base * (0.7 + rng() * JITTER_SPREAD);

  const clearReconnectTimer = () => {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const base = Math.min(INITIAL_DELAY_MS * 2 ** failures, MAX_DELAY_MS);
    failures += 1;
    reconnectTimer = setTimeout(open, jittered(base));
  };

  const handleOpen = () => {
    failures = 0; // успешное соединение сбрасывает backoff
    options.onStatus('online');
  };

  const handleError = () => {
    if (closed) return;
    eventSource?.close();
    eventSource = undefined;
    options.onStatus('offline');
    scheduleReconnect();
  };

  const handlePatch = (event: { data?: string }) => {
    let raw: unknown;
    try {
      raw = JSON.parse(event.data ?? '');
    } catch {
      return; // не-JSON — игнор
    }
    const parsed = patchSchema.safeParse(raw);
    if (parsed.success) {
      options.onPatch(parsed.data);
    }
    // невалидный payload — молча игнорируем
  };

  const open = () => {
    if (closed) return;
    options.onStatus('connecting');
    eventSource = factory(options.url);
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('patch', handlePatch);
    eventSource.addEventListener('error', handleError);
  };

  open();

  return {
    close() {
      closed = true;
      clearReconnectTimer();
      eventSource?.close();
      eventSource = undefined;
    },
  };
}
