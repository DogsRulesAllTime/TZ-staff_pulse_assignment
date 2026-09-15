/**
 * Pure AI-поиск domain (Task 12): детерминированный парсер естественно-языковых
 * запросов — БЕЗ LLM и сетевых вызовов (по плану стадии 04 BONUS).
 *
 * Композиция с существующим фильтром (docs: ruling 3/4):
 * - парсер распознал запрос → `StructuredFilter` уходит в ui-state, а
 *   `nameFilter` нейтрализуется (''), чтобы старый текстовый путь не режал
 *   строки сырым текстом запроса;
 * - не распознал (`null`) → запрос целиком уходит в `nameFilter` — работает
 *   прежний fallback `matchesFilter` (подстрока по имени/потомкам, дебаунс 250 мс
 *   остаётся в OrgDashboard).
 *
 * Грамматика (RU, регистр не важен; числа — арабские/латинские цифры):
 * - «команда/отдел/дивизион» (+ любые словоформы) → nameSubstring в базовой форме;
 * - «больше|свыше N человек|чел.|людей» → minHeadcount; «меньше|менее …» → maxHeadcount;
 * - «бюджет больше|меньше N (руб|рублей|млн|млрд|к|тыс)» → min/maxBudget
 *   (млн=1e6, млрд=1e9, тыс/к=1e3; «1,5 млн» → 1.5e6 — десятичная запятая;
 *   «1 000 000» — пробелы как разделители тысяч); деньги опознаются и без слова
 *   «бюджет», если есть денежная единица;
 * - «эффективность выше|ниже N» (0..100) → min/maxPerformance;
 * - несколько шаблонов в одном запросе комбинируются через AND;
 * - слова-связки («с», «и», «где», …) игнорируются; ЛЮБОЕ другое значимое
 *   слово после извлечения шаблонов → запрос нераспознан → null.
 */
import { nodeMatchesFilter } from './filter';
import { formatBudget } from './format';
import type { TreeNode } from './tree';

export interface StructuredFilter {
  nameSubstring?: string;
  minHeadcount?: number;
  maxHeadcount?: number;
  minBudget?: number;
  maxBudget?: number;
  minPerformance?: number;
  maxPerformance?: number;
}

/** Значения, к которым применяется числовая часть структурированного фильтра. */
export interface StructuredFilterSubject {
  headcount: number;
  budget: number;
  performance: number;
}

// Число: десятичная дробь с «.» или «,», пробелы как разделители тысяч.
const NUMBER = String.raw`\d+(?:[ ]\d{3})*(?:[.,]\d+)?`;
// Степени сравнения: «больше/более/свыше» → нижняя граница, «меньше/менее» → верхняя.
const MORE = 'больше|более|свыше';
const LESS = 'меньше|менее';
// Денежные единицы (не «руб» как единица множителя — множитель 1): отрицательный
// lookahead отсекает «к» внутри слов («5 команд» ≠ «5к»); полные слова
// «миллион/миллиард» (+ словоформы) наряду с сокращениями.
const MONEY_UNIT = String.raw`(?:\s*(миллиард[а-яё]*|миллион[а-яё]*|млрд|млн|тыс[а-яё]*|руб[а-яё]*|к))?(?:\s+руб[а-яё]*)?`;
const MONEY_UNIT_REQUIRED = String.raw`\s*(миллиард[а-яё]*|миллион[а-яё]*|млрд|млн|тыс[а-яё]*|руб[а-яё]*|к)(?:\s+руб[а-яё]*)?(?![а-яё])`;
// Единицы численности: «человек/человека/…», «чел.», «людей/людям/…», «сотрудник(ов)/…».
const PEOPLE_UNIT = String.raw`(?:\s*(челов[а-яё]*|чел(?![а-яё])|люд[а-яё]*|сотрудник[а-яё]*))`;
// Слова-связки, которые не мешают распознаванию.
const STOP_WORDS = new Set([
  'с',
  'со',
  'и',
  'или',
  'где',
  'у',
  'к',
  'для',
  'из',
  'от',
  'до',
  'не',
  'на',
  'по',
  'при',
  'все',
  'это',
  'чем',
  'которые',
  'которых',
  'который',
  'показать',
  'найди',
  'найти',
  'выведи',
  'список',
  'только',
  'мне',
  'нужно',
]);

/** Множитель денежной единицы; рубли/отсутствие единицы → 1. */
function unitFactor(unit: string | undefined): number {
  if (!unit) return 1;
  if (unit === 'млрд' || unit.startsWith('миллиард')) return 1e9;
  if (unit === 'млн' || unit.startsWith('миллион')) return 1e6;
  if (unit === 'к' || unit.startsWith('тыс')) return 1e3;
  return 1; // руб/рубля/рублей и т.п.
}

/** «1 000 000,5» → 1000000.5 (пробелы-тысячи и десятичная запятая). */
function parseNumber(raw: string): number {
  return Number.parseFloat(raw.replace(/ /g, '').replace(',', '.'));
}

function parseComparison(cmp: string): 'min' | 'max' {
  // «меньше/менее/ниже» — верхняя граница; «больше/более/свыше/выше» — нижняя.
  return cmp === 'меньше' || cmp === 'менее' || cmp === 'ниже' ? 'max' : 'min';
}

/**
 * Чистый парсер: возвращает StructuredFilter, если запрос распознан
 * (хотя бы один шаблон), иначе null — сигнал уйти в обычный текстовый поиск.
 */
export function parseNaturalQuery(query: string): StructuredFilter | null {
  const trimmed = query.trim();
  if (trimmed === '') {
    return null;
  }
  let text = trimmed.toLowerCase().replace(/\u00A0/g, ' ');
  const filter: StructuredFilter = {};

  // Вырезает совпавший шаблон из текста, чтобы остаток проверить на мусор.
  const cut = (match: RegExpMatchArray) => {
    const index = match.index;
    if (index === undefined) return; // недостижимо: match получен из text.match
    const before = text.slice(0, index);
    const after = text.slice(index + match[0].length);
    text = `${before} ${after}`.replace(/ {2,}/g, ' ').trim();
  };

  // 1. Эффективность: «эффективность выше/ниже N» (0..100).
  const perf = text.match(
    new RegExp(`эффективн[а-яё]*\\s+(${MORE}|выше|${LESS}|ниже)\\s*(${NUMBER})`),
  );
  if (perf) {
    cut(perf);
    const value = parseNumber(perf[2]);
    if (parseComparison(perf[1]) === 'min') {
      filter.minPerformance = value;
    } else {
      filter.maxPerformance = value;
    }
  }

  // 2a. Бюджет: «бюджет больше/меньше N (млн|млрд|тыс|к|руб…)». Число может
  // опускаться перед шкальной единицей («больше миллиона» = ≥ 1 млн).
  const budget = text.match(
    new RegExp(`бюджет[а-яё]*\\s+(${MORE}|${LESS})\\s*(${NUMBER})?${MONEY_UNIT}`),
  );
  if (budget && (budget[2] || unitFactor(budget[3]) > 1)) {
    cut(budget);
    // Группы: 1 — сравнение, 2 — число (может отсутствовать), 3 — денежная единица.
    const value = parseNumber(budget[2] ?? '1') * unitFactor(budget[3]);
    if (parseComparison(budget[1]) === 'min') {
      filter.minBudget = value;
    } else {
      filter.maxBudget = value;
    }
  } else {
    // 2b. Деньги без слова «бюджет» — только при явной денежной единице
    // («больше 2 млн рублей», «больше миллиона»), иначе число уйдёт в
    // headcount/эффективность. Без числа — только шкальная единица (млн/млрд).
    const money = text.match(new RegExp(`(${MORE}|${LESS})\\s*(${NUMBER})?${MONEY_UNIT_REQUIRED}`));
    if (money && (money[2] || unitFactor(money[3]) > 1)) {
      cut(money);
      const value = parseNumber(money[2] ?? '1') * unitFactor(money[3]);
      if (parseComparison(money[1]) === 'min') {
        filter.minBudget = value;
      } else {
        filter.maxBudget = value;
      }
    }
  }

  // 3. Численность: «больше/меньше N человек».
  const headcount = text.match(new RegExp(`(${MORE}|${LESS})\\s*(${NUMBER})${PEOPLE_UNIT}`));
  if (headcount) {
    cut(headcount);
    const value = parseNumber(headcount[2]);
    if (parseComparison(headcount[1]) === 'min') {
      filter.minHeadcount = value;
    } else {
      filter.maxHeadcount = value;
    }
  }

  // 4. Слова уровня оргструктуры → nameSubstring в базовой форме.
  const levels: [RegExp, string][] = [
    [/команд[а-яё]*/, 'команда'],
    [/отдел[а-яё]*/, 'отдел'],
    [/дивизион[а-яё]*/, 'дивизион'],
  ];
  for (const [pattern, base] of levels) {
    const level = text.match(pattern);
    if (level) {
      cut(level);
      filter.nameSubstring = base;
    }
  }

  // Ни один шаблон не распознан → обычный текстовый поиск.
  if (Object.keys(filter).length === 0) {
    return null;
  }

  // Значимый «мусор» после извлечения шаблонов → запрос нераспознан.
  const leftovers = text
    .replace(/[.,;:!?()«»"'№-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (leftovers.some((token) => !STOP_WORDS.has(token))) {
    return null;
  }
  return filter;
}

/**
 * Проверка числовых границ структурированного фильтра. Применяется:
 * - к узлу дерева (собственные значения узла — они и показаны в дереве);
 * - к строке таблицы (агрегаты полного поддерева — они и показаны в строке).
 */
export function matchesStructuredFilter(
  subject: StructuredFilterSubject,
  filter: StructuredFilter,
): boolean {
  if (filter.minHeadcount !== undefined && subject.headcount < filter.minHeadcount) return false;
  if (filter.maxHeadcount !== undefined && subject.headcount > filter.maxHeadcount) return false;
  if (filter.minBudget !== undefined && subject.budget < filter.minBudget) return false;
  if (filter.maxBudget !== undefined && subject.budget > filter.maxBudget) return false;
  if (filter.minPerformance !== undefined && subject.performance < filter.minPerformance) {
    return false;
  }
  if (filter.maxPerformance !== undefined && subject.performance > filter.maxPerformance) {
    return false;
  }
  return true;
}

/**
 * Проходит ли узел структурированный фильтр: nameSubstring — с семантикой
 * поддерева (как у обычного фильтра: предки совпавшего узла остаются),
 * числовые границы — по собственным значениям узла (то, что дерево показывает).
 */
export function nodePassesStructured(node: TreeNode, filter: StructuredFilter): boolean {
  if (filter.nameSubstring !== undefined && !nodeMatchesFilter(node, filter.nameSubstring)) {
    return false;
  }
  return matchesStructuredFilter(node, filter);
}

/**
 * Человекочитаемая сводка распознанного фильтра для подписи
 * «распознано: …» под строкой поиска.
 */
export function describeStructuredFilter(filter: StructuredFilter): string {
  const parts: string[] = [];
  if (filter.nameSubstring !== undefined) {
    parts.push(`название содержит «${filter.nameSubstring}»`);
  }
  if (filter.minHeadcount !== undefined) {
    parts.push(`сотрудников ≥ ${filter.minHeadcount}`);
  }
  if (filter.maxHeadcount !== undefined) {
    parts.push(`сотрудников ≤ ${filter.maxHeadcount}`);
  }
  if (filter.minBudget !== undefined) {
    parts.push(`бюджет ≥ ${formatBudget(filter.minBudget)}`);
  }
  if (filter.maxBudget !== undefined) {
    parts.push(`бюджет ≤ ${formatBudget(filter.maxBudget)}`);
  }
  if (filter.minPerformance !== undefined) {
    parts.push(`эффективность ≥ ${filter.minPerformance}`);
  }
  if (filter.maxPerformance !== undefined) {
    parts.push(`эффективность ≤ ${filter.maxPerformance}`);
  }
  return parts.join(', ');
}
