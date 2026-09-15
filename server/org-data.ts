// Чистая генерация данных оргструктуры. Без Express и без побочных эффектов:
// seeded PRNG гарантирует идентичные данные между перезапусками сервера.

export interface OrgNode {
  id: string;
  name: string;
  parentId: string | null; // null — корень (дивизион)
  headcount: number; // 3–60
  budget: number; // руб., целое, 100 000–50 000 000
  performance: number; // 10–99
  updatedAt: string; // ISO 8601
}

export const DIVISION_COUNT = 4;
export const MIN_NODES = 40;

const MIN_DEPARTMENTS = 2;
const MAX_DEPARTMENTS = 3;
const MIN_TEAMS = 2;
const MAX_TEAMS = 3;

const HEADCOUNT_RANGE = [3, 60] as const;
const BUDGET_RANGE = [100_000, 50_000_000] as const;
const PERFORMANCE_RANGE = [10, 99] as const;

const DEFAULT_SEED = 20250601;

// Фиксированная база updatedAt: данные полностью детерминированы между перезапусками.
const BASE_UPDATED_AT_MS = Date.parse('2025-01-06T09:00:00.000Z');

const DIVISION_NAMES = ['Север', 'Юг', 'Запад', 'Восток'];
const DEPARTMENT_NAMES = [
  'Разработка',
  'Продажи',
  'Маркетинг',
  'Поддержка',
  'Финансы',
  'Персонал',
  'Логистика',
  'Аналитика',
];
const TEAM_NAMES = [
  'Альфа',
  'Бета',
  'Гамма',
  'Дельта',
  'Эпсилон',
  'Дзета',
  'Эта',
  'Тета',
  'Йота',
  'Каппа',
  'Лямбда',
  'Сигма',
];

/** mulberry32 — компактный детерминированный PRNG, диапазон [0, 1). */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intInRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

interface DivisionBlueprint {
  departmentCount: number;
  teamsPerDepartment: number[];
}

/** Гарантирует MIN_NODES узлов, не выходя из диапазонов 2–3 отдела / 2–3 команды. */
function topUpToMinNodes(divisions: DivisionBlueprint[]): void {
  const totalNodes = () =>
    DIVISION_COUNT +
    divisions.reduce(
      (sum, d) => sum + d.departmentCount + d.teamsPerDepartment.reduce((a, b) => a + b, 0),
      0,
    );

  let slot = 0;
  while (totalNodes() < MIN_NODES) {
    const division = divisions[slot % divisions.length];
    slot += 1;
    const expandable = division.teamsPerDepartment.findIndex((t) => t < MAX_TEAMS);
    if (expandable !== -1) {
      division.teamsPerDepartment[expandable] += 1;
    } else if (division.departmentCount < MAX_DEPARTMENTS) {
      division.teamsPerDepartment.push(MAX_TEAMS);
      division.departmentCount += 1;
    }
  }
}

export function buildOrgTree(seed: number = DEFAULT_SEED): OrgNode[] {
  const rng = createRng(seed);

  const divisions: DivisionBlueprint[] = DIVISION_NAMES.map(() => ({
    departmentCount: intInRange(rng, MIN_DEPARTMENTS, MAX_DEPARTMENTS),
    teamsPerDepartment: [],
  }));
  for (const division of divisions) {
    for (let d = 0; d < division.departmentCount; d++) {
      division.teamsPerDepartment.push(intInRange(rng, MIN_TEAMS, MAX_TEAMS));
    }
  }
  topUpToMinNodes(divisions);

  const nodes: OrgNode[] = [];
  let updatedAtIndex = 0;
  const nextUpdatedAt = () =>
    new Date(BASE_UPDATED_AT_MS + updatedAtIndex++ * 60_000).toISOString();

  const pickName = (pool: string[]) => pool[Math.floor(rng() * pool.length)];

  divisions.forEach((division, i) => {
    const divisionId = `div-${i + 1}`;
    nodes.push({
      id: divisionId,
      name: `Дивизион «${DIVISION_NAMES[i]}»`,
      parentId: null,
      headcount: intInRange(rng, ...HEADCOUNT_RANGE),
      budget: intInRange(rng, ...BUDGET_RANGE),
      performance: intInRange(rng, ...PERFORMANCE_RANGE),
      updatedAt: nextUpdatedAt(),
    });

    for (let d = 0; d < division.departmentCount; d++) {
      const departmentId = `dept-${i + 1}-${d + 1}`;
      nodes.push({
        id: departmentId,
        name: pickName(DEPARTMENT_NAMES),
        parentId: divisionId,
        headcount: intInRange(rng, ...HEADCOUNT_RANGE),
        budget: intInRange(rng, ...BUDGET_RANGE),
        performance: intInRange(rng, ...PERFORMANCE_RANGE),
        updatedAt: nextUpdatedAt(),
      });

      for (let t = 0; t < division.teamsPerDepartment[d]; t++) {
        nodes.push({
          id: `team-${i + 1}-${d + 1}-${t + 1}`,
          name: `Команда «${pickName(TEAM_NAMES)}»`,
          parentId: departmentId,
          headcount: intInRange(rng, ...HEADCOUNT_RANGE),
          budget: intInRange(rng, ...BUDGET_RANGE),
          performance: intInRange(rng, ...PERFORMANCE_RANGE),
          updatedAt: nextUpdatedAt(),
        });
      }
    }
  });

  return nodes;
}
