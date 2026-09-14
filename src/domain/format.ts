/**
 * Pure formatting domain — no React, no component imports.
 *
 * Бюджет: `Intl.NumberFormat('ru-RU')` → `12 345 678 руб.` — разделитель групп
 * в ru-RU это неразрывный пробел U+00A0 (как в docs/data-model.md). Форматтеры
 * создаются один раз на модуль (дешевле, чем на каждый вызов).
 */

const budgetFormatter = new Intl.NumberFormat('ru-RU')

/** `12345678 → '12 345 678 руб.'` (пробелы — U+00A0). */
export function formatBudget(rub: number): string {
  return `${budgetFormatter.format(rub)}\u00A0руб.`
}

/**
 * Эффективность: одна десятичная при дробном значении, иначе целое
 * (`71.5 → '71,5 %'`, `80 → '80 %'`) — docs/data-model.md.
 */
export function formatPerformance(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  return `${text}\u00A0%`
}
