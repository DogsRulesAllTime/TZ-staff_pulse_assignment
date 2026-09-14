import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { theme } from '@/app/theme';
import { buildForest, type Forest } from '@/domain/tree';
import { aggregateForest } from '@/domain/aggregation';
import { node } from '@/test/factories';
import type { OrgData } from '@/features/useOrgData';
import { OrgDashboard } from './OrgDashboard';

vi.mock('@/features/useOrgData', () => ({
  useOrgData: vi.fn<() => OrgData>(),
}));

const useOrgData = vi.mocked((await import('@/features/useOrgData')).useOrgData);

const fixture = [
  node({ id: 'div-1', name: 'Дивизион 1', headcount: 100, budget: 1000, performance: 85 }),
  node({
    id: 'dept-1-1',
    name: 'Отдел 1.1',
    parentId: 'div-1',
    headcount: 40,
    budget: 500,
    performance: 60,
  }),
  node({
    id: 'dept-1-2',
    name: 'Отдел 1.2',
    parentId: 'div-1',
    headcount: 60,
    budget: 300,
    performance: 30,
  }),
  node({
    id: 'team-1-1-1',
    name: 'Команда 1.1.1',
    parentId: 'dept-1-1',
    headcount: 10,
    budget: 100,
    performance: 90,
  }),
  node({
    id: 'team-1-2-1',
    name: 'Команда 1.2.1',
    parentId: 'dept-1-2',
    headcount: 20,
    budget: 50,
    performance: 45,
  }),
];

function setOrgData(
  forest: Forest | undefined,
  status: OrgData['status'] = 'ready',
  changedCells: OrgData['changedCells'] = [],
) {
  vi.mocked(useOrgData).mockReturnValue({
    forest,
    status,
    refetch: vi.fn<() => void>(),
    aggregates: forest ? aggregateForest(forest) : undefined,
    changedCells,
  });
}

/**
 * jsdom не реализует matchMedia: подменяем для проверки split-view (≥1280px).
 * wide=false → узкий экран (активна одна вкладка), wide=true → split-view.
 */
function stubMatchMedia(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: wide,
      media: '(min-width: 1280px)',
      onchange: null,
      addEventListener: vi.fn<(...args: unknown[]) => void>(),
      removeEventListener: vi.fn<(...args: unknown[]) => void>(),
      addListener: vi.fn<(...args: unknown[]) => void>(),
      removeListener: vi.fn<(...args: unknown[]) => void>(),
      dispatchEvent: vi.fn<(...args: unknown[]) => void>(),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderDashboard() {
  return render(
    <ThemeProvider theme={theme}>
      <OrgDashboard />
    </ThemeProvider>,
  );
}

/** The treeitem <li> of a row, found via its unique visible name span (scoped to the tree pane). */
function rowOf(name: string): HTMLElement {
  return within(screen.getByRole('tree')).getByText(name, { exact: true }).closest('li')!;
}

/** Строки таблицы (role=row), исключая строку заголовка. */
function tableRows(): HTMLTableRowElement[] {
  return within(screen.getByRole('grid')).getAllByRole('row').slice(1) as HTMLTableRowElement[];
}

describe('OrgDashboard', () => {
  beforeEach(() => {
    vi.mocked(useOrgData).mockReset();
    stubMatchMedia(false);
  });

  it('renders the second level expanded on first data', () => {
    setOrgData(buildForest(fixture));
    renderDashboard();

    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Команда 1.1.1')).toBeInTheDocument();
  });

  it('preserves the user expansion across a refetch that rebuilds the forest', async () => {
    const user = userEvent.setup();
    setOrgData(buildForest(fixture));
    const { rerender } = renderDashboard();

    await user.click(rowOf('Отдел 1.1').querySelector('[data-chevron]')!);
    // Анимация (Task 9): поддерево остаётся в DOM persistent-mount, но инертно.
    expect(screen.getByText('Команда 1.1.1')).toBeInTheDocument();
    expect(rowOf('Отдел 1.1').querySelector<HTMLDivElement>('[data-reveal]')).toHaveAttribute(
      'inert',
    );

    // Refetch (refocus, staleTime) returns a fresh forest object of the same shape.
    setOrgData(buildForest(fixture));
    rerender(
      <ThemeProvider theme={theme}>
        <OrgDashboard />
      </ThemeProvider>,
    );

    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'false');
    expect(rowOf('Отдел 1.1').querySelector<HTMLDivElement>('[data-reveal]')).toHaveAttribute(
      'inert',
    );
  });

  it('renders both panes in split-view (≥1280px)', () => {
    stubMatchMedia(true);
    setOrgData(buildForest(fixture));
    renderDashboard();

    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('reduces table rows when the filter matches a subtree («1.1»), keeping ancestors', async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    setOrgData(buildForest(fixture));
    renderDashboard();

    expect(tableRows()).toHaveLength(5);

    await user.type(screen.getByRole('searchbox', { name: 'Фильтр по названию' }), '1.1');

    // Дебаунс 250мс: после него видны дивизион (предок) + отдел и команда «1.1».
    await waitFor(() => {
      expect(tableRows()).toHaveLength(3);
    });
    // Дефолтная сортировка — name asc: «Дивизион 1», «Команда 1.1.1», «Отдел 1.1».
    const visibleNames = tableRows().map((row) => row.cells[0].textContent);
    expect(visibleNames).toEqual(['Дивизион 1', 'Команда 1.1.1', 'Отдел 1.1']);
  });

  it('selects a node on row click: tree highlights it and expands the ancestor path', async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    setOrgData(buildForest(fixture));
    renderDashboard();

    // Сворачиваем отдел, чтобы проверить раскрытие пути к узлу (в таблице имя остаётся).
    // Анимация (Task 9): поддерево в DOM, но инертно — считать его скрытым.
    await user.click(rowOf('Отдел 1.1').querySelector('[data-chevron]')!);
    const deptReveal = rowOf('Отдел 1.1').querySelector<HTMLDivElement>('[data-reveal]')!;
    expect(deptReveal).toHaveAttribute('inert');
    expect(within(deptReveal).getByText('Команда 1.1.1')).toBeInTheDocument();

    await user.click(within(screen.getByRole('grid')).getByText('Команда 1.1.1'));

    expect(rowOf('Команда 1.1.1')).toHaveAttribute('aria-selected', 'true');
    expect(rowOf('Отдел 1.1')).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('tree')).getByText('Команда 1.1.1')).toBeInTheDocument();
    expect(rowOf('Отдел 1.1').querySelector<HTMLDivElement>('[data-reveal]')).not.toHaveAttribute(
      'inert',
    );
  });

  it('flips table sort to descending on header double-click', async () => {
    const user = userEvent.setup();
    stubMatchMedia(true);
    setOrgData(buildForest(fixture));
    renderDashboard();

    const headcountHeader = screen.getByRole('button', { name: 'Всего сотрудников' });

    // Двойной клик = два клика: asc → desc (ruling: цикл asc→desc, двойной клик — обратная).
    await user.dblClick(headcountHeader);

    const header = headcountHeader.closest('th')!;
    expect(header).toHaveAttribute('aria-sort', 'descending');
    // Агрегаты поддерева: дивизион 230, отдел 1.2 — 80 (60+20), отдел 1.1 — 50, команды 20 и 10.
    const firstColumn = tableRows().map((row) => row.cells[2].textContent);
    expect(firstColumn).toEqual(['230', '80', '50', '20', '10']);
  });

  it('прокидывает lastPatch: changedCells из useOrgData попадают в data-changed таблицы', () => {
    stubMatchMedia(true); // split-view: таблица отрендерена при дефолтном виде «дерево»
    setOrgData(buildForest(fixture), 'ready', [{ nodeId: 'dept-1-1', field: 'totalBudget' }]);
    render(
      <ThemeProvider theme={theme}>
        <OrgDashboard
          lastPatch={{
            seq: 1,
            id: 'dept-1-1',
            affectedIds: ['dept-1-1'],
            updatedAt: '2025-01-02T00:00:00.000Z',
          }}
        />
      </ThemeProvider>,
    );

    const table = within(screen.getByRole('grid'));
    const row = table.getByRole('row', { name: 'Отдел 1.1' });
    // totalBudget отдела 1.1 = 500 + 100 (команда) = 600.
    const budgetCell = row.querySelector('td:nth-child(4)')!;
    expect(budgetCell).toHaveAttribute('data-changed', 'true');
    // Остальные числовые ячейки строки не мигают.
    expect(row.querySelector('td:nth-child(3)')).not.toHaveAttribute('data-changed');
    expect(row.querySelector('td:nth-child(5)')).not.toHaveAttribute('data-changed');
  });
});
