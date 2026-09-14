import { useEffect, useState } from 'react'

/**
 * Trailing-edge debounce значения: обновление откладывается на `delay` мс,
 * каждый новый сброс значения перезапускает таймер. Используется для
 * фильтра по имени таблицы — 250 мс (Global Constraints, точно).
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debounced
}
