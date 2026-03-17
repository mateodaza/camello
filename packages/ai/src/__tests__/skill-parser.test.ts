import { describe, it, expect } from 'vitest';
import { parseSkillFile, filterLocale, estimateTokens } from '../skills/parser.js';

describe('skill-parser', () => {
  it('parses a valid skill file with all required fields', () => {
    const content = `---
slug: test-skill
name: Test Skill
description: A test skill
type: sales
trigger:
  mode: intent
  intents: [pricing, objection]
priority: 8
token_budget: 300
requires_modules: [qualify_lead]
conflicts_with: []
locale: [en, es]
version: 1
---

## Goal
Help the customer.
`;
    const skill = parseSkillFile('test.md', content);
    expect(skill.slug).toBe('test-skill');
    expect(skill.name).toBe('Test Skill');
    expect(skill.type).toBe('sales');
    expect(skill.trigger.mode).toBe('intent');
    expect(skill.trigger.intents).toEqual(['pricing', 'objection']);
    expect(skill.priority).toBe(8);
    expect(skill.requires_modules).toEqual(['qualify_lead']);
    expect(skill.source).toBe('platform');
    expect(skill.body).toContain('## Goal');
  });

  it('throws when slug is missing', () => {
    const content = `---
name: Test Skill
description: A description
trigger:
  mode: always
---
Body here.
`;
    expect(() => parseSkillFile('test.md', content)).toThrow('Missing required field: slug');
  });

  it('keeps matching-locale and untagged sections, strips non-matching', () => {
    const body = `
## Goal
Shared content here.

## Examples [en]
English examples.

## Examples [es]
Spanish examples.
`;
    const result = filterLocale(body, 'en');
    expect(result).toContain('Shared content here');
    expect(result).toContain('English examples');
    expect(result).not.toContain('Spanish examples');
  });

  it('estimates tokens as ceil(length / 4)', () => {
    expect(estimateTokens('hello')).toBe(2);   // ceil(5/4) = 2
    expect(estimateTokens('1234')).toBe(1);    // ceil(4/4) = 1
    expect(estimateTokens('12345')).toBe(2);   // ceil(5/4) = 2
    expect(estimateTokens('')).toBe(0);        // ceil(0/4) = 0
  });
});
