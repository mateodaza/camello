import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseSkillFile, filterLocale, estimateTokens } from '../skills/parser.js';
import type { SkillDefinition } from '../skills/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SALES_DIR = join(__dirname, '..', 'skills', 'sales');
const GENERAL_DIR = join(__dirname, '..', 'skills', 'general');

const SKILL_FILES = [
  'objection-competitor.md',
  'objection-pricing.md',
  'discovery-questions.md',
  'closing-techniques.md',
  'upsell-after-booking.md',
];

function loadSkill(filename: string): SkillDefinition {
  const filePath = join(SALES_DIR, filename);
  const content = readFileSync(filePath, 'utf-8');
  return parseSkillFile(filePath, content);
}

describe('skill-files', () => {
  // T1: All 5 files parse via parseSkillFile() without throwing
  it('all 5 skill files parse without error', () => {
    for (const file of SKILL_FILES) {
      expect(() => loadSkill(file)).not.toThrow();
    }
  });

  // T2: Each skill has non-empty intents or keywords
  it('all skills have non-empty intents or keywords in trigger', () => {
    for (const file of SKILL_FILES) {
      const skill = loadSkill(file);
      const hasIntents = (skill.trigger.intents?.length ?? 0) > 0;
      const hasKeywords = (skill.trigger.keywords?.length ?? 0) > 0;
      expect(hasIntents || hasKeywords, `${skill.slug} has no intents or keywords`).toBe(true);
    }
  });

  // T3: objection-pricing declares conflicts_with: [objection-competitor]
  it('objection-pricing has conflicts_with containing objection-competitor', () => {
    const skill = loadSkill('objection-pricing.md');
    expect(skill.conflicts_with).toContain('objection-competitor');
  });

  // T4: Body content after locale filtering fits within token_budget for both en and es
  it('body content after locale filtering is within token_budget for both locales', () => {
    for (const file of SKILL_FILES) {
      const skill = loadSkill(file);
      for (const locale of ['en', 'es']) {
        const filtered = filterLocale(skill.body, locale);
        const tokens = estimateTokens(filtered);
        expect(
          tokens,
          `${skill.slug} [${locale}] is ${tokens} tokens, exceeds budget of ${skill.token_budget}`,
        ).toBeLessThanOrEqual(skill.token_budget);
      }
    }
  });

  // T5: closing-techniques uses keyword mode with no intents
  it('closing-techniques has trigger.mode === keyword and no intents', () => {
    const skill = loadSkill('closing-techniques.md');
    expect(skill.trigger.mode).toBe('keyword');
    expect(skill.trigger.intents).toBeUndefined();
  });

  // T6: upsell-after-booking uses intent mode with booking_request
  it('upsell-after-booking has trigger.mode === intent with booking_request intent', () => {
    const skill = loadSkill('upsell-after-booking.md');
    expect(skill.trigger.mode).toBe('intent');
    expect(skill.trigger.intents).toContain('booking_request');
  });

  // T7: All 3 NC-307 skill files parse without error
  it('all 3 NC-307 skill files parse without error', () => {
    const generalFiles = [
      { dir: GENERAL_DIR, file: 'out-of-scope-deflection.md' },
      { dir: GENERAL_DIR, file: 'returning-customer-warmth.md' },
      { dir: SALES_DIR, file: 're-engagement-cold-lead.md' },
    ];
    for (const { dir, file } of generalFiles) {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, 'utf-8');
      expect(() => parseSkillFile(filePath, content)).not.toThrow();
    }
  });

  // T8: returning-customer-warmth has trigger.mode === 'always'
  it('returning-customer-warmth has trigger.mode === always', () => {
    const filePath = join(GENERAL_DIR, 'returning-customer-warmth.md');
    const content = readFileSync(filePath, 'utf-8');
    const skill = parseSkillFile(filePath, content);
    expect(skill.trigger.mode).toBe('always');
  });

  // T9: NC-307 files body content after locale filtering fits within token_budget
  it('NC-307 files body content after locale filtering is within token_budget', () => {
    const nc307Files = [
      { dir: GENERAL_DIR, file: 'out-of-scope-deflection.md' },
      { dir: GENERAL_DIR, file: 'returning-customer-warmth.md' },
      { dir: SALES_DIR, file: 're-engagement-cold-lead.md' },
    ];
    for (const { dir, file } of nc307Files) {
      const filePath = join(dir, file);
      const content = readFileSync(filePath, 'utf-8');
      const skill = parseSkillFile(filePath, content);
      for (const locale of ['en', 'es']) {
        const filtered = filterLocale(skill.body, locale);
        const tokens = estimateTokens(filtered);
        expect(
          tokens,
          `${skill.slug} [${locale}] is ${tokens} tokens, exceeds budget of ${skill.token_budget}`,
        ).toBeLessThanOrEqual(skill.token_budget);
      }
    }
  });
});
