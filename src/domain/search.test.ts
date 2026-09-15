import { describe, expect, it } from 'vitest';
import { buildForest, type TreeNode } from './tree';
import {
  describeStructuredFilter,
  matchesStructuredFilter,
  nodePassesStructured,
  parseNaturalQuery,
  type StructuredFilter,
} from './search';
import { node, type NodeInput } from '@/test/factories';

describe('parseNaturalQuery', () => {
  it('returns null for an empty/whitespace query', () => {
    expect(parseNaturalQuery('')).toBeNull();
    expect(parseNaturalQuery('   ')).toBeNull();
  });

  it('returns null for an unrecognized query (fallback to matchesFilter)', () => {
    expect(parseNaturalQuery('платформа')).toBeNull();
    expect(parseNaturalQuery('1.1')).toBeNull();
    expect(parseNaturalQuery('привет мир')).toBeNull();
  });

  it('returns null when nothing follows a comparison word', () => {
    expect(parseNaturalQuery('больше')).toBeNull();
  });

  // --- headcount -----------------------------------------------------------

  it('parses «больше 20 человек» as minHeadcount', () => {
    expect(parseNaturalQuery('больше 20 человек')).toEqual({ minHeadcount: 20 });
  });

  it('parses «менее 15 человек» as maxHeadcount', () => {
    expect(parseNaturalQuery('менее 15 человек')).toEqual({ maxHeadcount: 15 });
  });

  it('parses «свыше 100 человек» and «меньше 5 человек»', () => {
    expect(parseNaturalQuery('свыше 100 человек')).toEqual({ minHeadcount: 100 });
    expect(parseNaturalQuery('меньше 5 человек')).toEqual({ maxHeadcount: 5 });
  });

  it('parses headcount with a space thousand separator («больше 1 000 человек»)', () => {
    expect(parseNaturalQuery('больше 1 000 человек')).toEqual({ minHeadcount: 1000 });
  });

  it('parses the short form «чел.» and «людей»', () => {
    expect(parseNaturalQuery('меньше 10 чел.')).toEqual({ maxHeadcount: 10 });
    expect(parseNaturalQuery('больше 50 людей')).toEqual({ minHeadcount: 50 });
  });

  // --- budget --------------------------------------------------------------

  it('parses «бюджет больше 1 млн» as minBudget 1e6', () => {
    expect(parseNaturalQuery('бюджет больше 1 млн')).toEqual({ minBudget: 1_000_000 });
  });

  it('parses «бюджет меньше 500 тыс» as maxBudget 5e5', () => {
    expect(parseNaturalQuery('бюджет меньше 500 тыс')).toEqual({ maxBudget: 500_000 });
  });

  it('parses «бюджет больше 2 млрд» as minBudget 2e9', () => {
    expect(parseNaturalQuery('бюджет больше 2 млрд')).toEqual({ minBudget: 2_000_000_000 });
  });

  it('parses the short form «к» as thousands («бюджет больше 5к»)', () => {
    expect(parseNaturalQuery('бюджет больше 5к')).toEqual({ minBudget: 5000 });
  });

  it('parses inflected «бюджетом» and the «рублей» unit', () => {
    expect(parseNaturalQuery('бюджетом больше 1000000 рублей')).toEqual({ minBudget: 1_000_000 });
  });

  it('parses money without the word «бюджет» when a money unit is present', () => {
    expect(parseNaturalQuery('больше 2 млн рублей')).toEqual({ minBudget: 2_000_000 });
    expect(parseNaturalQuery('меньше 50 тыс')).toEqual({ maxBudget: 50_000 });
  });

  it('parses an exact large amount with space thousand separators', () => {
    expect(parseNaturalQuery('бюджет больше 1 000 000')).toEqual({ minBudget: 1_000_000 });
  });

  it('parses full word forms «миллион/миллиарда» and «сотрудников»', () => {
    // Живой кейс от пользователя: словоформа «миллиона» раньше не узнавалась.
    expect(parseNaturalQuery('бюджет больше миллиона')).toEqual({ minBudget: 1_000_000 });
    expect(parseNaturalQuery('больше 2 миллиона рублей')).toEqual({ minBudget: 2_000_000 });
    expect(parseNaturalQuery('команды с бюджетом больше миллиона')).toEqual({
      nameSubstring: 'команда',
      minBudget: 1_000_000,
    });
    expect(parseNaturalQuery('бюджет больше 1 миллиарда')).toEqual({ minBudget: 1_000_000_000 });
    expect(parseNaturalQuery('больше 30 сотрудников')).toEqual({ minHeadcount: 30 });
  });

  it('parses the RU decimal comma («1,5 млн» → 1.5e6)', () => {
    expect(parseNaturalQuery('бюджет больше 1,5 млн')).toEqual({ minBudget: 1_500_000 });
  });

  it('parses the decimal dot as an english numeral («1.5 млн»)', () => {
    expect(parseNaturalQuery('бюджет больше 1.5 млн')).toEqual({ minBudget: 1_500_000 });
  });

  it('parses decimal comma combined with thousand spaces («1 000 000,5»)', () => {
    expect(parseNaturalQuery('бюджет больше 1 000 000,5')).toEqual({ minBudget: 1_000_000.5 });
  });

  // --- performance ---------------------------------------------------------

  it('parses «эффективность выше 80» as minPerformance', () => {
    expect(parseNaturalQuery('эффективность выше 80')).toEqual({ minPerformance: 80 });
  });

  it('parses «эффективность ниже 50» as maxPerformance', () => {
    expect(parseNaturalQuery('эффективность ниже 50')).toEqual({ maxPerformance: 50 });
  });

  it('parses the inflected «эффективностью»', () => {
    expect(parseNaturalQuery('эффективностью больше 70')).toEqual({ minPerformance: 70 });
  });

  // --- name (level words) --------------------------------------------------

  it('maps level words to the base form as nameSubstring', () => {
    expect(parseNaturalQuery('команды')).toEqual({ nameSubstring: 'команда' });
    expect(parseNaturalQuery('отделы')).toEqual({ nameSubstring: 'отдел' });
    expect(parseNaturalQuery('дивизионы')).toEqual({ nameSubstring: 'дивизион' });
  });

  // --- combined patterns (AND) ---------------------------------------------

  it('parses the combined «команды с бюджетом больше 1 млн»', () => {
    expect(parseNaturalQuery('команды с бюджетом больше 1 млн')).toEqual({
      nameSubstring: 'команда',
      minBudget: 1_000_000,
    });
  });

  it('combines level + performance + budget in one query', () => {
    expect(parseNaturalQuery('отделы с эффективностью выше 70 и бюджетом меньше 10 млн')).toEqual({
      nameSubstring: 'отдел',
      minPerformance: 70,
      maxBudget: 10_000_000,
    });
  });

  it('combines headcount and performance', () => {
    expect(parseNaturalQuery('больше 20 человек и эффективность ниже 40')).toEqual({
      minHeadcount: 20,
      maxPerformance: 40,
    });
  });

  it('is case-insensitive', () => {
    expect(parseNaturalQuery('КОМАНДЫ С БЮДЖЕТОМ БОЛЬШЕ 1 МЛН')).toEqual({
      nameSubstring: 'команда',
      minBudget: 1_000_000,
    });
  });

  it('returns null when an unknown significant word remains after extraction', () => {
    expect(parseNaturalQuery('команды привет')).toBeNull();
    expect(parseNaturalQuery('больше 20 слонов')).toBeNull();
  });
});

describe('matchesStructuredFilter', () => {
  const subject = { headcount: 50, budget: 1_500_000, performance: 70 };

  it('passes when the filter is empty', () => {
    expect(matchesStructuredFilter(subject, {})).toBe(true);
  });

  it('applies inclusive lower and upper bounds', () => {
    expect(matchesStructuredFilter(subject, { minHeadcount: 50 })).toBe(true);
    expect(matchesStructuredFilter(subject, { minHeadcount: 51 })).toBe(false);
    expect(matchesStructuredFilter(subject, { maxBudget: 1_500_000 })).toBe(true);
    expect(matchesStructuredFilter(subject, { maxBudget: 1_499_999 })).toBe(false);
    expect(matchesStructuredFilter(subject, { minPerformance: 70 })).toBe(true);
    expect(matchesStructuredFilter(subject, { maxPerformance: 69 })).toBe(false);
  });

  it('combines bounds with AND', () => {
    expect(
      matchesStructuredFilter(subject, {
        minHeadcount: 10,
        maxBudget: 2_000_000,
        minPerformance: 60,
      }),
    ).toBe(true);
    expect(matchesStructuredFilter(subject, { minHeadcount: 10, minPerformance: 80 })).toBe(false);
  });
});

describe('nodePassesStructured', () => {
  const fixture: NodeInput[] = [
    node({
      id: 'div-1',
      name: 'Дивизион Запад',
      headcount: 100,
      budget: 2_000_000,
      performance: 85,
    }),
    node({
      id: 'dept-1-1',
      name: 'Отдел разработки',
      parentId: 'div-1',
      headcount: 40,
      budget: 500_000,
      performance: 60,
    }),
    node({
      id: 'team-1-1-1',
      name: 'Команда Платформа',
      parentId: 'dept-1-1',
      headcount: 10,
      budget: 100_000,
      performance: 90,
    }),
  ];

  function forestNodes(): TreeNode[] {
    return [...buildForest(fixture).byId.values()];
  }

  it('checks numeric bounds against the node own values', () => {
    const nodes = forestNodes();
    const div = nodes.find((n) => n.id === 'div-1')!;
    expect(nodePassesStructured(div, { minHeadcount: 100 })).toBe(true);
    expect(nodePassesStructured(div, { minHeadcount: 101 })).toBe(false);
  });

  it('applies nameSubstring with subtree semantics (ancestors pass)', () => {
    const nodes = forestNodes();
    const div = nodes.find((n) => n.id === 'div-1')!;
    // «Платформа» — имя команды-потомка: дивизион-предок проходит.
    expect(nodePassesStructured(div, { nameSubstring: 'платформа' })).toBe(true);
    expect(nodePassesStructured(div, { nameSubstring: 'восток' })).toBe(false);
  });
});

describe('describeStructuredFilter', () => {
  it('renders a human-readable RU summary of every recognized part', () => {
    const filter: StructuredFilter = {
      nameSubstring: 'команда',
      minHeadcount: 20,
      maxBudget: 1_000_000,
      minPerformance: 80,
    };
    const text = describeStructuredFilter(filter);
    expect(text).toContain('название содержит «команда»');
    expect(text).toContain('сотрудников ≥ 20');
    // formatBudget даёт U+00A0 между группами разрядов.
    expect(text).toContain(`бюджет ≤ 1${NBSP}000${NBSP}000`);
    expect(text).toContain('эффективность ≥ 80');
  });

  it('renders upper bounds too', () => {
    expect(describeStructuredFilter({ maxHeadcount: 5 })).toContain('сотрудников ≤ 5');
    expect(describeStructuredFilter({ maxPerformance: 50 })).toContain('эффективность ≤ 50');
  });
});

const NBSP = '\u00A0';
