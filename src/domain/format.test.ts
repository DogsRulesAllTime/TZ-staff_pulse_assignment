import { describe, expect, it } from 'vitest';
import { formatBudget, formatPerformance } from './format';

describe('formatBudget', () => {
  it('formats 12 345 678 руб. with ru-RU grouping (non-breaking spaces)', () => {
    expect(formatBudget(12345678)).toBe('12\u00A0345\u00A0678\u00A0руб.');
  });

  it('formats small budgets without grouping', () => {
    expect(formatBudget(500)).toBe('500\u00A0руб.');
  });

  it('formats zero', () => {
    expect(formatBudget(0)).toBe('0\u00A0руб.');
  });
});

describe('formatPerformance', () => {
  it('formats an integer value without decimals', () => {
    expect(formatPerformance(80)).toBe('80\u00A0%');
  });

  it('formats a fractional value with one decimal', () => {
    expect(formatPerformance(71.5)).toBe('71,5\u00A0%');
  });

  it('rounds to one decimal at most', () => {
    // (60·4 + 50·6) / 10 = 54 — точное; 55.555… → 55,6
    expect(formatPerformance(54)).toBe('54\u00A0%');
    expect(formatPerformance(55.55555)).toBe('55,6\u00A0%');
  });
});
