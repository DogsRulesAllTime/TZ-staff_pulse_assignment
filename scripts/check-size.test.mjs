// @vitest-environment node
// Юнит-тесты хелпера бюджета размера бандла (scripts/check-size.mjs).
// Фикстуры: временная директория с файлами разных расширений; ожидаемый gzip-размер
// считается в тесте тем же zlib.gzipSync — проверяем сумму, фильтрацию и порог.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUDGET_BYTES,
  checkBudget,
  collectJsAssets,
  gzipTotalBytes,
  runCheck,
} from './check-size.mjs';

/** @type {string[]} */
const tempDirs = [];

/** @param {{ [name: string]: string }} files */
function makeFixtureDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'check-size-'));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('collectJsAssets', () => {
  it('возвращает только .js файлы, отсортированные по имени', () => {
    const dir = makeFixtureDir({
      'b.js': 'console.log(2);',
      'a.js': 'console.log(1);',
      'style.css': 'body{}',
      'index.html': '<html></html>',
    });
    expect(collectJsAssets(dir)).toEqual([join(dir, 'a.js'), join(dir, 'b.js')]);
  });

  it('возвращает пустой список, если .js файлов нет', () => {
    const dir = makeFixtureDir({ 'style.css': 'body{}' });
    expect(collectJsAssets(dir)).toEqual([]);
  });
});

describe('gzipTotalBytes', () => {
  it('суммирует gzip-размер каждого файла', () => {
    const contentA = 'const x = "' + 'a'.repeat(1000) + '";';
    const contentB = 'const y = "' + 'b'.repeat(500) + '";';
    const dir = makeFixtureDir({ 'a.js': contentA, 'b.js': contentB });
    const expected =
      gzipSync(Buffer.from(contentA)).byteLength + gzipSync(Buffer.from(contentB)).byteLength;
    expect(gzipTotalBytes(collectJsAssets(dir))).toBe(expected);
  });

  it('пустой список файлов даёт 0', () => {
    expect(gzipTotalBytes([])).toBe(0);
  });
});

describe('checkBudget', () => {
  it('в пределах бюджета — ok: true', () => {
    const result = checkBudget(BUDGET_BYTES - 1);
    expect(result.ok).toBe(true);
  });

  it('ровно на границе бюджета — ok: true', () => {
    expect(checkBudget(BUDGET_BYTES).ok).toBe(true);
  });

  it('сверх бюджета — ok: false и сообщение с размерами', () => {
    const result = checkBudget(BUDGET_BYTES + 1000);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(String(BUDGET_BYTES + 1000));
    expect(result.message).toContain(String(BUDGET_BYTES));
  });
});

describe('runCheck', () => {
  it('пустой dist (нет *.js) — ok: false с подсказкой про pnpm build', () => {
    const dir = makeFixtureDir({ 'index.html': '<html></html>', 'style.css': 'body{}' });
    const result = runCheck({ assetsDir: dir });
    expect(result.ok).toBe(false);
    expect(result.total).toBe(0);
    expect(result.message).toContain('pnpm build');
  });

  it('непустой dist — обычная проверка бюджета', () => {
    const dir = makeFixtureDir({ 'index.js': 'const x = 1;' });
    const result = runCheck({ assetsDir: dir });
    expect(result.ok).toBe(true);
    expect(result.total).toBe(gzipSync(Buffer.from('const x = 1;')).byteLength);
  });
});
