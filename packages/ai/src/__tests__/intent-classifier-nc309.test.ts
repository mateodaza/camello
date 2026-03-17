import { describe, it, expect } from 'vitest';
import { REGEX_INTENTS } from '@camello/shared/constants';
import { intentSchema } from '@camello/shared/schemas';
import { getIntentProfile } from '../intent-profiles.js';

// Helper
function anyMatch(intent: string, msg: string): boolean {
  return REGEX_INTENTS[intent].some((p: RegExp) => p.test(msg));
}

describe('NC-309: Relaxed regex — greeting', () => {
  // T1: AC1 — "hello there" matches greeting regex
  it('T1: "hello there" matches greeting regex', () => {
    expect(anyMatch('greeting', 'hello there')).toBe(true);
  });

  // T2: AC2 — "hi, can you help?" does NOT match (falls to LLM)
  it('T2: "hi, can you help?" does not match any regex pattern', () => {
    const matchesAny = Object.values(REGEX_INTENTS).some(patterns =>
      patterns.some(p => p.test('hi, can you help?'))
    );
    expect(matchesAny).toBe(false);
  });

  // T3: AC3 — "buenos días" matches greeting regex
  it('T3: "buenos días" matches greeting regex', () => {
    expect(anyMatch('greeting', 'buenos días')).toBe(true);
  });

  // Additional: question forms rejected
  it('T7b: question-form greetings fall to LLM', () => {
    expect(anyMatch('greeting', 'hi?')).toBe(false);
    expect(anyMatch('greeting', 'hello?')).toBe(false);
    expect(anyMatch('greeting', 'hello, I need a quote')).toBe(false);
  });
});

describe('NC-309: Relaxed regex — farewell', () => {
  it('T7: "gracias" matches farewell regex', () => {
    expect(anyMatch('farewell', 'gracias')).toBe(true);
  });
});

describe('NC-309: New intent types in Zod enum', () => {
  // T4: AC4 — new types exist in Zod enum
  it('T4: objection, comparison, open_discovery exist in intentSchema enum', () => {
    const options = intentSchema.shape.type.options;
    expect(options).toContain('objection');
    expect(options).toContain('comparison');
    expect(options).toContain('open_discovery');
  });
});

describe('NC-309: New intent profiles', () => {
  // T5: AC5 — objection profile has correct module whitelist
  it('T5: objection profile allows qualify_lead, send_quote, book_meeting', () => {
    const profile = getIntentProfile({
      type: 'objection', confidence: 0.9, complexity: 'medium',
      requires_knowledge_base: false, sentiment: 'neutral', source: 'llm',
    });
    expect(profile.allowedModuleSlugs).toEqual(['qualify_lead', 'send_quote', 'book_meeting']);
  });

  // T6: AC6 — open_discovery allows all modules, maxSteps: 5
  it('T6: open_discovery profile has no module restriction and maxSteps 5', () => {
    const profile = getIntentProfile({
      type: 'open_discovery', confidence: 0.9, complexity: 'medium',
      requires_knowledge_base: false, sentiment: 'neutral', source: 'llm',
    });
    expect(profile.allowedModuleSlugs).toBeUndefined();
    expect(profile.maxSteps).toBe(5);
  });

  // T8: comparison profile allows qualify_lead only
  it('T8: comparison profile allows qualify_lead only', () => {
    const profile = getIntentProfile({
      type: 'comparison', confidence: 0.9, complexity: 'medium',
      requires_knowledge_base: false, sentiment: 'neutral', source: 'llm',
    });
    expect(profile.allowedModuleSlugs).toEqual(['qualify_lead']);
  });

  // T9: "hello, I need a quote" does not match any regex
  it('T9: "hello, I need a quote" does not match any regex pattern', () => {
    const matchesAny = Object.values(REGEX_INTENTS).some(patterns =>
      patterns.some(p => p.test('hello, I need a quote'))
    );
    expect(matchesAny).toBe(false);
  });
});
