import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTableSort } from './useTableSort';

interface Row {
  name: string;
  depth: number;
  headcount: number;
}

const rows: Row[] = [
  { name: 'Отдел продаж', depth: 1, headcount: 60 },
  { name: 'Дивизион Запад', depth: 0, headcount: 100 },
  { name: 'Команда Платформа', depth: 2, headcount: 10 },
];

describe('useTableSort', () => {
  it('defaults to name asc when no explicit initial is given', () => {
    const { result } = renderHook(() =>
      useTableSort<Row, 'name' | 'depth' | 'headcount'>(rows, { key: 'name', dir: 'asc' }),
    );

    expect(result.current.sort).toEqual({ key: 'name', dir: 'asc' });
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      'Дивизион Запад',
      'Команда Платформа',
      'Отдел продаж',
    ]);
  });

  it('sorts numbers numerically by a clicked column', () => {
    const { result } = renderHook(() =>
      useTableSort<Row, 'name' | 'depth' | 'headcount'>(rows, { key: 'name', dir: 'asc' }),
    );

    act(() => result.current.toggleSort('headcount'));

    expect(result.current.sort).toEqual({ key: 'headcount', dir: 'asc' });
    expect(result.current.sorted.map((r) => r.headcount)).toEqual([10, 60, 100]);
  });

  it('single repeat click on the same column cycles asc → desc (задокументировано: двойной клик = два клика → desc)', () => {
    const { result } = renderHook(() =>
      useTableSort<Row, 'name' | 'depth' | 'headcount'>(rows, { key: 'name', dir: 'asc' }),
    );

    act(() => result.current.toggleSort('name'));
    expect(result.current.sort).toEqual({ key: 'name', dir: 'desc' });
    expect(result.current.sorted.map((r) => r.name)).toEqual([
      'Отдел продаж',
      'Команда Платформа',
      'Дивизион Запад',
    ]);

    // Цикл замыкается: третий клик — снова asc.
    act(() => result.current.toggleSort('name'));
    expect(result.current.sort).toEqual({ key: 'name', dir: 'asc' });
  });

  it('double-click on a column yields desc (click = asc, click = desc)', () => {
    const { result } = renderHook(() =>
      useTableSort<Row, 'name' | 'depth' | 'headcount'>(rows, { key: 'name', dir: 'asc' }),
    );

    act(() => result.current.toggleSort('depth')); // asc
    act(() => result.current.toggleSort('depth')); // desc

    expect(result.current.sort).toEqual({ key: 'depth', dir: 'desc' });
    expect(result.current.sorted.map((r) => r.depth)).toEqual([2, 1, 0]);
  });

  it('clicking a different column always starts from asc', () => {
    const { result } = renderHook(() =>
      useTableSort<Row, 'name' | 'depth' | 'headcount'>(rows, { key: 'name', dir: 'desc' }),
    );

    act(() => result.current.toggleSort('headcount'));
    expect(result.current.sort).toEqual({ key: 'headcount', dir: 'asc' });
  });
});
