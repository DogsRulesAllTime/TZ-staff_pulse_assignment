import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCellFlash, type ChangedCell } from './useCellFlash';

function cell(nodeId: string, field: ChangedCell['field'] = 'totalHeadcount'): ChangedCell {
  return { nodeId, field };
}

interface HookProps {
  cells: ChangedCell[];
  seq: number;
}

const FLASH_MS = 1500;

describe('useCellFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderFlash(props: HookProps, strict = false) {
    const wrapper = strict
      ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
      : undefined;
    return renderHook(({ cells, seq }: HookProps) => useCellFlash(cells, seq), {
      initialProps: props,
      ...(wrapper ? { wrapper } : {}),
    });
  }

  it('ничего не мигает до первого патча (seq = 0)', () => {
    const { result } = renderFlash({ cells: [cell('a')], seq: 0 });

    expect(result.current.size).toBe(0);
  });

  it('(c) помечает изменившиеся ячейки и снимает их через 1.5с', () => {
    const { result, rerender } = renderFlash({ cells: [], seq: 0 });

    rerender({ cells: [cell('team-1'), cell('team-1', 'totalBudget')], seq: 1 });

    expect(result.current.get('team-1:totalHeadcount')).toBe(1);
    expect(result.current.get('team-1:totalBudget')).toBe(1);

    act(() => {
      vi.advanceTimersByTime(FLASH_MS);
    });

    expect(result.current.size).toBe(0);
  });

  it('таймеры раннего патча переживают более поздний патч (без преждевременного снятия)', () => {
    const { result, rerender } = renderFlash({ cells: [], seq: 0 });

    rerender({ cells: [cell('a')], seq: 1 });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    // Новый патч мигает другую ячейку.
    rerender({ cells: [cell('b')], seq: 2 });

    expect(result.current.get('a:totalHeadcount')).toBe(1);
    expect(result.current.get('b:totalHeadcount')).toBe(1);

    act(() => {
      vi.advanceTimersByTime(800); // a достигает своих 1500 мс
    });
    expect(result.current.has('a:totalHeadcount')).toBe(false);
    expect(result.current.has('b:totalHeadcount')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(700); // b достигает своих 1500 мс
    });
    expect(result.current.size).toBe(0);
  });

  it('повторный патч по мигающей ячейке перезапускает таймер и чётность', () => {
    const { result, rerender } = renderFlash({ cells: [], seq: 0 });

    rerender({ cells: [cell('a')], seq: 1 });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Тот же патч через 500 мс: счётчик 2 (нечётная чётность → рестарт анимации).
    rerender({ cells: [cell('a')], seq: 2 });
    expect(result.current.get('a:totalHeadcount')).toBe(2);

    act(() => {
      vi.advanceTimersByTime(500); // суммарно 1000 мс — старые 1500 мс истекли бы
    });
    expect(result.current.has('a:totalHeadcount')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000); // 1500 мс от второго патча
    });
    expect(result.current.size).toBe(0);
  });

  it('unmount снимает таймеры — обновлений состояния после размонтирования нет', () => {
    const { result, rerender, unmount } = renderFlash({ cells: [], seq: 0 });
    rerender({ cells: [cell('a')], seq: 1 });
    expect(result.current.size).toBe(1);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      unmount();
      act(() => {
        vi.advanceTimersByTime(FLASH_MS * 2);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('(StrictMode) двойное монтирование не ломает тайминги и не задваивает счётчик', () => {
    const { result, rerender } = renderFlash({ cells: [], seq: 0 }, true);

    rerender({ cells: [cell('a')], seq: 1 });

    // Эффект патча выполнен один раз: счётчик 1, а не 2.
    expect(result.current.get('a:totalHeadcount')).toBe(1);
    act(() => {
      vi.advanceTimersByTime(FLASH_MS);
    });
    expect(result.current.size).toBe(0);
  });
});
