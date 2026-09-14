// Проверка бюджета размера клиентского бандла: суммарный gzip-размер dist/assets/*.js
// должен быть <= 200 000 байт. Подключён в `pnpm build` после `vite build` (см. package.json).
// Хелперы (collectJsAssets / gzipTotalBytes / checkBudget) экспортируются и покрыты
// юнит-тестами в scripts/check-size.test.mjs.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Бюджет суммарного gzip-размера всех JS-ассетов, байты. */
export const BUDGET_BYTES = 200_000;

/**
 * Список абсолютных путей к *.js файлам в директории (без рекурсии), отсортированный по имени.
 * @param {string} assetsDir
 * @returns {string[]}
 */
export function collectJsAssets(assetsDir) {
  return readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js') && statSync(join(assetsDir, name)).isFile())
    .sort()
    .map((name) => join(assetsDir, name));
}

/**
 * Суммарный gzip-размер переданных файлов (каждый сжимается zlib.gzipSync, суммы складываются —
 * бюджет на весь бандл целиком, а не пофайлово).
 * @param {string[]} files
 * @returns {number}
 */
export function gzipTotalBytes(files) {
  return files.reduce((total, file) => total + gzipSync(readFileSync(file)).byteLength, 0);
}

/**
 * Проверка суммы против бюджета: ок, пока total <= budget.
 * @param {number} totalBytes
 * @param {number} [budgetBytes]
 * @returns {{ ok: boolean, message: string }}
 */
export function checkBudget(totalBytes, budgetBytes = BUDGET_BYTES) {
  const totalKb = (totalBytes / 1000).toFixed(1);
  const budgetKb = (budgetBytes / 1000).toFixed(1);
  if (totalBytes <= budgetBytes) {
    return {
      ok: true,
      message: `bundle size OK: ${totalBytes} bytes gzip (${totalKb} KB) <= budget ${budgetBytes} (${budgetKb} KB)`,
    };
  }
  const over = totalBytes - budgetBytes;
  return {
    ok: false,
    message:
      `bundle size budget EXCEEDED: ${totalBytes} bytes gzip (${totalKb} KB) > budget ` +
      `${budgetBytes} bytes (${budgetKb} KB) — over by ${over} bytes. ` +
      `Shrink the client bundle (lazy chunks, drop deps) or raise BUDGET_BYTES in scripts/check-size.mjs explicitly.`,
  };
}

/** Полная проверка: собрать dist/assets/*.js, посчитать gzip-сумму, сравнить с бюджетом.
 * @param {{ assetsDir?: string, budgetBytes?: number }} [options]
 */
export function runCheck({ assetsDir = 'dist/assets', budgetBytes = BUDGET_BYTES } = {}) {
  const files = collectJsAssets(assetsDir);
  if (files.length === 0) {
    return {
      files,
      total: 0,
      ok: false,
      message: `dist пуст — в "${assetsDir}" нет *.js ассетов. Сначала pnpm build.`,
    };
  }
  const total = gzipTotalBytes(files);
  const verdict = checkBudget(total, budgetBytes);
  return { files, total, ...verdict };
}

// Запуск как CLI: `node scripts/check-size.mjs` (импорт из теста CLI-часть не выполняет).
const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const assetsDir = process.argv[2] ?? 'dist/assets';
  let report;
  try {
    report = runCheck({ assetsDir });
  } catch (error) {
    process.stderr.write(
      `check-size: cannot read JS assets in "${assetsDir}" — run the build first (pnpm build)?\n` +
        `  ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`${report.message}\n`);
  process.exit(report.ok ? 0 : 1);
}
