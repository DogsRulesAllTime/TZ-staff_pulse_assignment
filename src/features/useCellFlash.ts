/**
 * Fade-out ячеек таблицы (Task 8): общие типы, ключ flash-состояния и хук,
 * который держит ячейку «мигающей» FLASH_DURATION_MS после патча.
 */
import { useEffect, useRef, useState } from 'react';

/** Числовые поля агрегатов, отображаемые в таблице (колонки MetricsTable). */
export type FlashField = 'totalHeadcount' | 'totalBudget' | 'weightedPerformance';

/** Ячейка, чьё ЗНАЧЕНИЕ изменилось из-за последнего SSE-патча. */
export interface ChangedCell {
  nodeId: string;
  field: FlashField;
}

/**
 * Ключ flash-состояния ячейки: `${nodeId}:${field}`. Один формат для
 * производителя (useOrgData → changedCells) и потребителя (MetricsTable).
 */
export function cellFlashKey(cell: ChangedCell): string {
  return `${cell.nodeId}:${cell.field}`;
}

/** Длительность fade-out (бриф Task 8: ~1.5с; та же цифра в keyframes таблицы). */
export const FLASH_DURATION_MS = 1500;

/**
 * Fade-out-состояние ячеек (Task 8).
 *
 * Вход: `changedCells` — ячейки последнего патча (из useOrgData), `seq` —
 * монотонный номер патча (0 = патчей не было). Выход: Map
 * `cellFlashKey → счётчик вспышек ячейки`; наличие ключа = ячейка мигает,
 * чётность счётчика = какая из двух одинаковых keyframes-анимаций активна
 * (смена чётности перезапускает CSS-анимацию при повторном патче, пока
 * предыдущая ещё не истекла).
 *
 * Тайминги: таймеры живут в ref и НЕ сбрасываются при смене deps — иначе
 * новый патч отменял бы незавершённые вспышки предыдущего. Снятие таймеров
 * происходит только в unmount-cleanup отдельного эффекта (переживает
 * StrictMode-двойное монтирование: на монтировании таймеров ещё нет).
 */
export function useCellFlash(
  changedCells: readonly ChangedCell[],
  seq: number,
  durationMs: number = FLASH_DURATION_MS,
): ReadonlyMap<string, number> {
  const [flashCounts, setFlashCounts] = useState<ReadonlyMap<string, number>>(
    () => new Map<string, number>(),
  );
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const countsRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (seq === 0 || changedCells.length === 0) return;
    const next = new Map(flashCounts);
    for (const changedCell of changedCells) {
      const key = cellFlashKey(changedCell);
      const count = (countsRef.current.get(key) ?? 0) + 1;
      countsRef.current.set(key, count);
      next.set(key, count);
      const previous = timersRef.current.get(key);
      if (previous !== undefined) {
        clearTimeout(previous);
      }
      timersRef.current.set(
        key,
        setTimeout(() => {
          timersRef.current.delete(key);
          setFlashCounts((current) => {
            if (!current.has(key)) return current;
            const updated = new Map(current);
            updated.delete(key);
            return updated;
          });
        }, durationMs),
      );
    }
    // Синхронизация состояния вспышек с приходом SSE-патча; useState+effect —
    // осознанный выбор (см. докблок хука). oxlint/react/set-state-in-effect это
    // место не флагает (set после цикла, а не вывод состояния из себя).
    setFlashCounts(next);
    // Намеренно без cleanup: см. комментарий к хуку — таймеры переживают
    // смену deps, иначе патчи отменяли бы вспышки друг друга.
    // oxlint-disable-next-line react/exhaustive-deps -- flashCounts читается только как затравка next; включать в deps нельзя (бесконечный цикл), актуальность обеспечивают [seq, changedCells]
  }, [seq, changedCells, durationMs]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return flashCounts;
}
