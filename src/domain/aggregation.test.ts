import { describe, expect, it } from 'vitest';
import { aggregateForest, recomputeBranch } from './aggregation';
import { buildForest } from './tree';
import { node, type NodeInput } from '@/test/factories';

/** Фикстура из брифа: дивизион 10 чел./perf 80 → отдел 4 чел./perf 60 → команда 6 чел./perf 50. */
const chainFixture: NodeInput[] = [
  node({ id: 'div-1', name: 'Дивизион 1', headcount: 10, budget: 1_000_000, performance: 80 }),
  node({
    id: 'dept-1-1',
    name: 'Отдел 1.1',
    parentId: 'div-1',
    headcount: 4,
    budget: 400_000,
    performance: 60,
  }),
  node({
    id: 'team-1-1-1',
    name: 'Команда 1.1.1',
    parentId: 'dept-1-1',
    headcount: 6,
    budget: 250_000,
    performance: 50,
  }),
];

/** Расширенная фикстура для тестов эквивалентности и сохранения идентичности: */
/** к цепочке добавлены соседняя команда и второй дивизион. */
const wideFixture: NodeInput[] = [
  ...chainFixture,
  node({
    id: 'team-1-1-2',
    name: 'Команда 1.1.2',
    parentId: 'dept-1-1',
    headcount: 4,
    budget: 150_000,
    performance: 75,
  }),
  node({ id: 'div-2', name: 'Дивизион 2', headcount: 5, budget: 500_000, performance: 90 }),
];

describe('aggregateForest', () => {
  it('leaf aggregates equal its own values', () => {
    const aggregates = aggregateForest(buildForest(chainFixture));

    expect(aggregates.get('team-1-1-1')).toEqual({
      totalHeadcount: 6,
      totalBudget: 250_000,
      weightedPerformance: 50,
    });
  });

  it('middle node aggregates its subtree (dept = own + team)', () => {
    const aggregates = aggregateForest(buildForest(chainFixture));

    // (60·4 + 50·6) / 10 = 54
    expect(aggregates.get('dept-1-1')).toEqual({
      totalHeadcount: 10,
      totalBudget: 650_000,
      weightedPerformance: 54,
    });
  });

  it('division: totalHeadcount = 20, totalBudget = сумма всех, weightedPerformance = 67', () => {
    const aggregates = aggregateForest(buildForest(chainFixture));

    const division = aggregates.get('div-1')!;
    expect(division.totalHeadcount).toBe(20);
    expect(division.totalBudget).toBe(1_000_000 + 400_000 + 250_000);
    // (80·10 + 60·4 + 50·6) / 20 = 1340 / 20 = 67
    expect(division.weightedPerformance).toBeCloseTo(67, 10);
  });

  it('empty forest → empty Map, no NaN', () => {
    const aggregates = aggregateForest(buildForest([]));

    expect(aggregates).toBeInstanceOf(Map);
    expect(aggregates.size).toBe(0);
  });
});

describe('recomputeBranch', () => {
  it('after patching team 12 чел./perf 70 equals a fresh full aggregateForest', () => {
    const forest = buildForest(chainFixture);
    const aggregates = aggregateForest(forest);

    const team = forest.byId.get('team-1-1-1')!;
    team.headcount = 12;
    team.performance = 70;

    const recomputed = recomputeBranch(forest, aggregates, ['team-1-1-1']);
    const fresh = aggregateForest(forest);

    expect(recomputed).toEqual(fresh);
    // дивизион: собственные 10 + отдел 4 + команда 12 = 26; (80·10 + 60·4 + 70·12) / 26 = 1880 / 26
    expect(recomputed.get('div-1')!.totalHeadcount).toBe(26);
    expect(recomputed.get('div-1')!.weightedPerformance).toBeCloseTo(1880 / 26, 10);
  });

  it('patching a node with children recomputes the whole branch (dept patch)', () => {
    const forest = buildForest(chainFixture);
    const aggregates = aggregateForest(forest);

    const dept = forest.byId.get('dept-1-1')!;
    dept.performance = 20;

    const recomputed = recomputeBranch(forest, aggregates, ['dept-1-1']);
    const fresh = aggregateForest(forest);

    expect(recomputed).toEqual(fresh);
    // отдел: (20·4 + 50·6) / 10 = 38
    expect(recomputed.get('dept-1-1')!.weightedPerformance).toBeCloseTo(38, 10);
  });

  it('mutates the passed Map in place and returns the same instance', () => {
    const forest = buildForest(chainFixture);
    const aggregates = aggregateForest(forest);
    const before = aggregates.get('team-1-1-1');

    const returned = recomputeBranch(forest, aggregates, ['team-1-1-1']);

    expect(returned).toBe(aggregates);
    expect(aggregates.get('team-1-1-1')).not.toBe(before);
  });

  it('preserves object identity of untouched nodes’ aggregates', () => {
    const forest = buildForest(wideFixture);
    const aggregates = aggregateForest(forest);
    const siblingTeamBefore = aggregates.get('team-1-1-2');
    const otherDivisionBefore = aggregates.get('div-2');

    const team = forest.byId.get('team-1-1-1')!;
    team.headcount = 12;
    team.performance = 70;
    recomputeBranch(forest, aggregates, ['team-1-1-1']);

    expect(aggregates.get('team-1-1-2')).toBe(siblingTeamBefore);
    expect(aggregates.get('div-2')).toBe(otherDivisionBefore);
  });

  it('branching fixture: patching one sibling mixes fresh child with stale-but-valid cached sibling, equals fresh aggregateForest', () => {
    const forest = buildForest(wideFixture);
    const aggregates = aggregateForest(forest);
    const untouchedSiblingBefore = aggregates.get('team-1-1-1');

    const team = forest.byId.get('team-1-1-2')!;
    team.headcount = 12;
    team.performance = 70;

    const recomputed = recomputeBranch(forest, aggregates, ['team-1-1-2']);
    const fresh = aggregateForest(forest);

    // Отдел 1.1 собирает свежепересчитанную команду 1.1.2 с кэшированной
    // (не тронутой) командой 1.1.1 — тот самый путь смешивания соседей.
    expect(untouchedSiblingBefore).toBeDefined();
    expect(aggregates.get('team-1-1-1')).toBe(untouchedSiblingBefore);
    expect(recomputed).toEqual(fresh);
    // отдел: собственные 4 + команда 1.1.1 (6) + команда 1.1.2 (12) = 22;
    // perf = (60·4 + 50·6 + 70·12) / 22 = 1380 / 22
    expect(recomputed.get('dept-1-1')!.totalHeadcount).toBe(22);
    expect(recomputed.get('dept-1-1')!.weightedPerformance).toBeCloseTo(1380 / 22, 10);
    // дивизион: 10 собственных + 22 из отдела = 32
    expect(recomputed.get('div-1')!.totalHeadcount).toBe(32);
  });

  it('ignores unknown changed ids gracefully (no crash, map untouched)', () => {
    const forest = buildForest(chainFixture);
    const aggregates = aggregateForest(forest);
    const snapshot = new Map(aggregates);

    expect(() => recomputeBranch(forest, aggregates, ['ghost'])).not.toThrow();
    expect(aggregates).toEqual(snapshot);
  });
});
