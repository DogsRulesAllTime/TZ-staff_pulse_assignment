import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

/**
 * Сортировка таблицы (ruling контроллера, Global Constraints: «двойной клик —
 * обратная»). Один хук обслуживает и одиночный, и двойной клик:
 *
 * - клик по ДРУГОМУ столбцу → { key, 'asc' };
 * - одиночный ПОВТОРНЫЙ клик по тому же столбцу циклически меняет
 *   asc → desc → asc (общепринятый паттерн; осознанный выбор вместо
 *   «повторный клик — без смены» из брифа — выбран он потому, что тогда
 *   двойной клик естественно даёт desc);
 * - двойной клик = два одиночных по тому же столбцу → desc.
 *
 * Дефолт — по `name` asc (задаётся вызывающим кодом через `initial`).
 * Числа сравниваются численно, строки — локале-зависимо ('ru').
 * Смешанные/неполные типы: если значение не число с обеих сторон —
 * откат к строковому сравнению через String().
 */
export function useTableSort<T, K extends keyof T & string>(
  rows: readonly T[],
  initial: SortState<K>,
): { sorted: T[]; sort: SortState<K>; toggleSort: (key: K) => void } {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const toggleSort = (key: K): void => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      const compared =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal), 'ru');
      return sort.dir === 'asc' ? compared : -compared;
    });
    return copy;
  }, [rows, sort]);

  return { sorted, sort, toggleSort };
}
