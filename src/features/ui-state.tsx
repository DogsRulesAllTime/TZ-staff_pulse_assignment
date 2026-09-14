import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type DashboardView = 'tree' | 'table';

export interface UiState {
  view: DashboardView;
  setView: (view: DashboardView) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  nameFilter: string;
  setNameFilter: (value: string) => void;
}

const UiStateContext = createContext<UiState | null>(null);

/**
 * UI-состояние дашборда (какой вид открыт, выбранный узел, фильтр по имени).
 * Серверное состояние живёт в TanStack Query — сюда попадает только чистый UI.
 */
export function UiStateProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<DashboardView>('tree');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState('');

  const value = useMemo(
    () => ({ view, setView, selectedId, setSelectedId, nameFilter, setNameFilter }),
    [view, selectedId, nameFilter],
  );

  return <UiStateContext.Provider value={value}>{children}</UiStateContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- хук и Provider неразделимы по домену; полная перезагрузка файла при HMR приемлема
export function useUiState(): UiState {
  const ctx = useContext(UiStateContext);
  if (!ctx) {
    throw new Error('useUiState должен вызываться внутри <UiStateProvider>');
  }
  return ctx;
}
