import { useEffect, useState } from 'react';

/**
 * Реактивный matchMedia: true, когда медиа-запрос совпадает.
 * Используется для split-view ≥1280px — обе панели рендерятся только на
 * широком экране; ниже порога активен единственный вид (ViewToggle).
 * jsdom реализует matchMedia (всегда matches: false), поэтому в компонентных
 * тестах экран считается узким; guard нужен для окружений без matchMedia
 * и для явной подмены в тестах.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    // oxlint-disable-next-line react/set-state-in-effect -- ресинк состояния при смене query; useState+effect — осознанная альтернатива useSyncExternalStore (jsdom/подмены в тестах)
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}

/** Порог split-view из задания: обе панели рядом начиная с 1280px. */
export const SPLIT_VIEW_QUERY = '(min-width: 1280px)';
