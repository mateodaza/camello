import { describe, it, expect } from 'vitest';
import { parseBudgetString } from '../modules/qualify-lead.js';

describe('parseBudgetString', () => {
  it('parses plain number string', () => {
    expect(parseBudgetString('5000')).toBe(5000);
  });

  it('parses $5,000', () => {
    expect(parseBudgetString('$5,000')).toBe(5000);
  });

  it('parses $5k', () => {
    expect(parseBudgetString('$5k')).toBe(5000);
  });

  it('parses $5K (uppercase)', () => {
    expect(parseBudgetString('$5K')).toBe(5000);
  });

  it('strips ~ approximation prefix', () => {
    expect(parseBudgetString('~5000')).toBe(5000);
  });

  it('strips "around" prefix', () => {
    expect(parseBudgetString('around 5000')).toBe(5000);
  });

  it('strips "about $2k"', () => {
    expect(parseBudgetString('about $2k')).toBe(2000);
  });

  it('strips USD currency prefix', () => {
    expect(parseBudgetString('USD 5000')).toBe(5000);
  });

  it('strips /month rate suffix', () => {
    expect(parseBudgetString('5000/month')).toBe(5000);
  });

  it('parses $3k-5k range as midpoint', () => {
    expect(parseBudgetString('$3k-5k')).toBe(4000);
  });

  it('parses 5M', () => {
    expect(parseBudgetString('5M')).toBe(5_000_000);
  });

  it('parses 2B', () => {
    expect(parseBudgetString('2B')).toBe(2_000_000_000);
  });

  it('parses $10,500.50', () => {
    expect(parseBudgetString('$10,500.50')).toBe(10500.5);
  });

  it('returns null for "not sure"', () => {
    expect(parseBudgetString('not sure')).toBeNull();
  });

  it('returns null for "flexible"', () => {
    expect(parseBudgetString('flexible')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseBudgetString('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseBudgetString('   ')).toBeNull();
  });
});
