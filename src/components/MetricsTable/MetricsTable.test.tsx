import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { theme } from '@/app/theme';
import { MetricsTable, type MetricColumn, type MetricRow } from './MetricsTable';

const rows: MetricRow[] = [
  {
    id: 'div-1',
    name: 'Дивизион 1',
    depth: 0,
    totalHeadcount: 110,
    totalBudget: 1_600_000,
    weightedPerformance: 67,
  },
  {
    id: 'dept-1-1',
    name: 'Отдел 1.1',
    depth: 1,
    totalHeadcount: 10,
    totalBudget: 650_000,
    weightedPerformance: 54,
  },
];

function renderTable(overrides: Partial<Parameters<typeof MetricsTable>[0]> = {}) {
  const props: Parameters<typeof MetricsTable>[0] = {
    rows,
    sort: { key: 'name', dir: 'asc' },
    onSortToggle: vi.fn<(key: MetricColumn) => void>(),
    selectedId: null,
    onSelect: vi.fn<(id: string) => void>(),
    ...overrides,
  };
  render(
    <ThemeProvider theme={theme}>
      <MetricsTable {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe('MetricsTable', () => {
  it('renders the five assignment columns', () => {
    renderTable();

    for (const label of [
      'Подразделение',
      'Уровень',
      'Всего сотрудников',
      'Бюджет суммарный',
      'Средняя эффективность',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('renders aggregate values: headcount, ru-RU budget, performance', () => {
    renderTable();

    expect(screen.getByText('10')).toBeInTheDocument();
    // NBSP из formatBudget: RTL нормализует текст DOM (включая U+00A0) в пробел,
    // поэтому в компонентных тестах строка-запрос — с обычными пробелами.
    // Точный контракт «12 345 678 руб.» с U+00A0 покрыт в domain/format.test.ts.
    expect(screen.getByText('650 000 руб.')).toBeInTheDocument();
    expect(screen.getByText('54 %')).toBeInTheDocument();
    expect(screen.getByText('Отдел')).toBeInTheDocument(); // уровень depth=1
  });

  it('marks the sorted column with aria-sort', () => {
    renderTable({ sort: { key: 'totalBudget', dir: 'desc' } });

    const budgetHeader = screen.getByRole('button', { name: 'Бюджет суммарный' }).closest('th')!;
    expect(budgetHeader).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('button', { name: 'Подразделение' }).closest('th')).not.toHaveAttribute(
      'aria-sort',
    );
  });

  it('toggles sort via the header button', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    await user.click(screen.getByRole('button', { name: 'Всего сотрудников' }));
    expect(props.onSortToggle).toHaveBeenCalledWith('totalHeadcount');
  });

  it('double-click forces descending regardless of preceding clicks («двойной клик — обратная»)', async () => {
    const user = userEvent.setup();
    const props = renderTable();
    const header = screen.getByRole('button', { name: 'Всего сотрудников' });

    await user.click(header); // клик: новый столбец → asc
    await user.dblClick(header); // dblclick: force desc — число click-событий среды не важно

    expect(props.onSortToggle).toHaveBeenLastCalledWith('totalHeadcount', 'desc');
  });

  it('selects a node on row click', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    await user.click(screen.getByText('Отдел 1.1'));
    expect(props.onSelect).toHaveBeenCalledWith('dept-1-1');
  });

  it('marks the selected row with aria-selected and is keyboard-focusable', () => {
    renderTable({ selectedId: 'dept-1-1' });

    const row = screen.getByRole('row', { name: 'Отдел 1.1' });
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveAttribute('tabindex', '0');

    const otherRow = screen.getByRole('row', { name: 'Дивизион 1' });
    expect(otherRow).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a node on row Enter', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    const row = screen.getByText('Отдел 1.1').closest('tr')!;
    row.focus();
    expect(row).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(props.onSelect).toHaveBeenCalledWith('dept-1-1');
  });

  it('selects a node on row Space', async () => {
    const user = userEvent.setup();
    const props = renderTable();

    const row = screen.getByText('Дивизион 1').closest('tr')!;
    row.focus();
    expect(row).toHaveFocus();

    await user.keyboard(' ');
    expect(props.onSelect).toHaveBeenCalledWith('div-1');
  });

  it('shows an empty state when no rows match the filter', () => {
    renderTable({ rows: [] });

    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
  });

  it('без flashingCells ни одна ячейка не помечена data-changed', () => {
    renderTable();

    for (const row of screen.getAllByRole('row')) {
      for (const cell of within(row).queryAllByRole('cell')) {
        expect(cell).not.toHaveAttribute('data-changed');
      }
    }
  });

  it('fade-out: data-changed стоит ровно на мигающей числовой ячейке, не на строке/таблице', () => {
    renderTable({ flashingCells: new Map([['dept-1-1:totalBudget', 1]]) });

    const row = screen.getByRole('row', { name: 'Отдел 1.1' });
    const budgetCell = within(row).getByText('650 000 руб.').closest('td')!;
    expect(budgetCell).toHaveAttribute('data-changed', 'true');
    // Нечётный счётчик вспышек → альтернативные keyframes (рестарт анимации).
    expect(budgetCell).toHaveAttribute('data-flash-parity', 'odd');

    // Соседние числовые ячейки той же строки не мигают.
    const headcountCell = within(row).getByText('10').closest('td')!;
    expect(headcountCell).not.toHaveAttribute('data-changed');
    expect(within(row).getByText('54 %').closest('td')).not.toHaveAttribute('data-changed');

    // Другие строки не мигают вообще.
    const otherRow = screen.getByRole('row', { name: 'Дивизион 1' });
    for (const td of within(otherRow).getAllByRole('cell')) {
      expect(td).not.toHaveAttribute('data-changed');
    }
  });

  it('fade-out: чётный счётчик вспышек → parity "even"', () => {
    renderTable({ flashingCells: new Map([['div-1:totalHeadcount', 2]]) });

    const row = screen.getByRole('row', { name: 'Дивизион 1' });
    const headcountCell = within(row).getByText('110').closest('td')!;
    expect(headcountCell).toHaveAttribute('data-changed', 'true');
    expect(headcountCell).toHaveAttribute('data-flash-parity', 'even');
  });
});

describe('MetricsTable keyboard navigation', () => {
  const rows3: MetricRow[] = [
    {
      id: 'div-1',
      name: 'Дивизион 1',
      depth: 0,
      totalHeadcount: 110,
      totalBudget: 1_600_000,
      weightedPerformance: 67,
    },
    {
      id: 'dept-1-1',
      name: 'Отдел 1.1',
      depth: 1,
      totalHeadcount: 10,
      totalBudget: 650_000,
      weightedPerformance: 54,
    },
    {
      id: 'dept-1-2',
      name: 'Отдел 1.2',
      depth: 1,
      totalHeadcount: 30,
      totalBudget: 300_000,
      weightedPerformance: 40,
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
    // scrollIntoView-стабб через Object.defineProperty живёт на прототипе —
    // удаляем его после каждого теста, чтобы утечка не трогала другие файлы.
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  function rowOf(name: string): HTMLTableRowElement {
    return screen.getByRole('row', { name });
  }

  /** jsdom не реализует scrollIntoView — ставим шпион вместо отсутствующего метода. */
  function stubScrollIntoView() {
    const spy = vi.fn<() => void>();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: spy,
    });
    return spy;
  }

  /** Как stubScrollIntoView, но запоминает this (элемент, на котором вызван). */
  function stubScrollIntoViewWithTarget() {
    const targets: Element[] = [];
    const spy = vi.fn<(this: Element) => void>(function (this: Element) {
      targets.push(this);
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: spy,
    });
    return { spy, targets };
  }

  it('ArrowDown перемещает реальный DOM-фокус на следующую строку', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const first = rowOf('Дивизион 1');
    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(rowOf('Отдел 1.1')).toHaveFocus();
  });

  it('ArrowUp перемещает фокус на предыдущую строку', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const second = rowOf('Отдел 1.1');
    second.focus();
    fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(rowOf('Дивизион 1')).toHaveFocus();
  });

  it('ArrowDown на последней строке остаётся на ней', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const last = rowOf('Отдел 1.2');
    last.focus();
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(last).toHaveFocus();
  });

  it('ArrowUp на первой строке остаётся на ней', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const first = rowOf('Дивизион 1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(first).toHaveFocus();
  });

  it('Home → первая строка, End → последняя', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const first = rowOf('Дивизион 1');
    const last = rowOf('Отдел 1.2');

    last.focus();
    fireEvent.keyDown(last, { key: 'Home' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(last).toHaveFocus();
  });

  it('обработанные клавиши предотвращают действие по умолчанию (нет скролла страницы)', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const pd = vi.spyOn(KeyboardEvent.prototype, 'preventDefault');
    const row = rowOf('Дивизион 1');
    row.focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
      pd.mockClear();
      fireEvent.keyDown(row, { key });
      expect(pd).toHaveBeenCalledTimes(1);
    }
  });

  it('Ctrl+ArrowDown не перехватывается: фокус не двигается и нет preventDefault', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const pd = vi.spyOn(KeyboardEvent.prototype, 'preventDefault');
    const first = rowOf('Дивизион 1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown', ctrlKey: true });
    expect(first).toHaveFocus();
    expect(pd).not.toHaveBeenCalled();
  });

  it('необработанные клавиши (ArrowLeft/ArrowRight) не перехватываются', () => {
    stubScrollIntoView();
    renderTable({ rows: rows3 });

    const pd = vi.spyOn(KeyboardEvent.prototype, 'preventDefault');
    const first = rowOf('Дивизион 1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(pd).not.toHaveBeenCalled();
    expect(first).toHaveFocus();
  });

  it('после перехода фокуса вызывается scrollIntoView({block:"nearest"}) на новой строке', () => {
    const { spy, targets } = stubScrollIntoViewWithTarget();
    renderTable({ rows: rows3 });

    const first = rowOf('Дивизион 1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ block: 'nearest' });
    expect(targets[0]).toBe(rowOf('Отдел 1.1'));
  });

  it('Enter по-прежнему выделяет строку (регресс клавиатурного выделения)', async () => {
    stubScrollIntoView();
    const user = userEvent.setup();
    const props = renderTable({ rows: rows3 });

    const row = rowOf('Отдел 1.1');
    row.focus();
    await user.keyboard('{Enter}');
    expect(props.onSelect).toHaveBeenCalledWith('dept-1-1');
  });
});
