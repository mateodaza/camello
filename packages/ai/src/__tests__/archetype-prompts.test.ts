import { describe, it, expect } from 'vitest';
import {
  ARCHETYPE_PROMPTS,
  ARCHETYPE_DEFAULT_TONES,
  ARCHETYPE_MODULE_SLUGS,
} from '../archetype-prompts.js';
import { getQuickActionsForModules } from '../module-registry.js';

// Trigger module self-registration (side-effect import)
import '../modules/index.js';

describe('ARCHETYPE_PROMPTS', () => {
  it('has prompts for sales, support, and marketing', () => {
    expect(ARCHETYPE_PROMPTS.sales).toBeDefined();
    expect(ARCHETYPE_PROMPTS.support).toBeDefined();
    expect(ARCHETYPE_PROMPTS.marketing).toBeDefined();
  });

  it('does not include custom type', () => {
    expect(ARCHETYPE_PROMPTS.custom).toBeUndefined();
  });

  for (const type of ['sales', 'support', 'marketing'] as const) {
    it(`${type} has non-empty en and es prompts`, () => {
      const prompt = ARCHETYPE_PROMPTS[type]!;
      expect(prompt.en.length).toBeGreaterThan(50);
      expect(prompt.es.length).toBeGreaterThan(50);
    });

    it(`${type} en prompt contains BEHAVIORAL FRAMEWORK`, () => {
      expect(ARCHETYPE_PROMPTS[type]!.en).toContain('BEHAVIORAL FRAMEWORK');
    });

    it(`${type} es prompt contains MARCO DE COMPORTAMIENTO`, () => {
      expect(ARCHETYPE_PROMPTS[type]!.es).toContain('MARCO DE COMPORTAMIENTO');
    });
  }
});

describe('ARCHETYPE_DEFAULT_TONES', () => {
  for (const type of ['sales', 'support', 'marketing'] as const) {
    it(`${type} has non-empty tone for both locales`, () => {
      expect(ARCHETYPE_DEFAULT_TONES[type].en.length).toBeGreaterThan(0);
      expect(ARCHETYPE_DEFAULT_TONES[type].es.length).toBeGreaterThan(0);
    });
  }

  it('custom type has empty tones', () => {
    expect(ARCHETYPE_DEFAULT_TONES.custom.en).toBe('');
    expect(ARCHETYPE_DEFAULT_TONES.custom.es).toBe('');
  });
});

describe('ARCHETYPE_MODULE_SLUGS', () => {
  it('sales binds qualify_lead and book_meeting', () => {
    expect(ARCHETYPE_MODULE_SLUGS.sales).toEqual(['qualify_lead', 'book_meeting']);
  });

  it('support binds no modules', () => {
    expect(ARCHETYPE_MODULE_SLUGS.support).toEqual([]);
  });

  it('marketing binds send_followup', () => {
    expect(ARCHETYPE_MODULE_SLUGS.marketing).toEqual(['send_followup']);
  });

  it('custom binds no modules', () => {
    expect(ARCHETYPE_MODULE_SLUGS.custom).toEqual([]);
  });
});

describe('getQuickActionsForModules', () => {
  it('returns 2 actions for sales archetype slugs (en)', () => {
    const actions = getQuickActionsForModules(['book_meeting', 'qualify_lead'], 'en');
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe('Book a meeting');
    expect(actions[1].label).toBe('Tell me what you need');
  });

  it('returns Spanish actions for es locale', () => {
    const actions = getQuickActionsForModules(['book_meeting', 'qualify_lead'], 'es');
    expect(actions).toHaveLength(2);
    expect(actions[0].label).toBe('Agendar reunión');
    expect(actions[1].label).toBe('Cuéntanos qué necesitas');
  });

  it('returns empty for unknown slugs', () => {
    const actions = getQuickActionsForModules(['nonexistent', 'also_fake'], 'en');
    expect(actions).toEqual([]);
  });

  it('returns empty for empty slug array', () => {
    const actions = getQuickActionsForModules([], 'en');
    expect(actions).toEqual([]);
  });

  it('preserves input slug order (deterministic)', () => {
    // Alphabetical sort: book_meeting < qualify_lead < send_followup
    const sorted = ['book_meeting', 'qualify_lead', 'send_followup'];
    const actions = getQuickActionsForModules(sorted, 'en');
    expect(actions).toHaveLength(3);
    expect(actions.map((a) => a.label)).toEqual([
      'Book a meeting',
      'Tell me what you need',
      'Request a follow-up',
    ]);
  });
});
