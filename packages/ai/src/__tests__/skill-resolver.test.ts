import { describe, it, expect, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _clearSkillRegistry,
  _registerSkillForTesting,
  _loadFromDirectory,
  getSkill,
} from '../skills/index.js';
import { resolveSkills, SKILL_TOKEN_CAP } from '../skills/resolver.js';
import type { SkillDefinition, SkillResolutionContext } from '../skills/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = join(__dirname, 'fixtures', 'skills');

function makeSkill(overrides: Partial<SkillDefinition> & { slug: string }): SkillDefinition {
  return {
    name: overrides.slug,
    description: 'test',
    type: 'sales',
    trigger: { mode: 'always' },
    priority: 5,
    token_budget: 200,
    requires_modules: [],
    conflicts_with: [],
    locale: ['en'],
    version: 1,
    body: `## Body\nContent for ${overrides.slug}.`,
    source: 'platform',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<SkillResolutionContext> = {}): SkillResolutionContext {
  return {
    intent: { type: 'greeting', confidence: 0.9 },
    messageText: 'Hello',
    artifactType: 'sales',
    activeModuleSlugs: [],
    locale: 'en',
    ...overrides,
  };
}

describe('skill-registry', () => {
  beforeEach(() => _clearSkillRegistry());

  // T1: Registry loads valid .md files from a directory
  it('loads valid skill files from a directory', () => {
    _loadFromDirectory(FIXTURES_DIR);
    const skill = getSkill('fixture-skill');
    expect(skill).toBeDefined();
    expect(skill?.name).toBe('Fixture Skill');
    expect(skill?.type).toBe('sales');
  });
});

describe('skill-resolver', () => {
  beforeEach(() => _clearSkillRegistry());

  // T2: Intent trigger matches
  it('returns skill when intent trigger matches', () => {
    _registerSkillForTesting(
      makeSkill({ slug: 'pricing-guide', trigger: { mode: 'intent', intents: ['pricing'] } }),
    );
    const results = resolveSkills(makeCtx({ intent: { type: 'pricing', confidence: 0.9 } }));
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('pricing-guide');
  });

  // T3: Intent trigger doesn't match
  it('returns no skills when intent trigger does not match', () => {
    _registerSkillForTesting(
      makeSkill({ slug: 'pricing-guide', trigger: { mode: 'intent', intents: ['pricing'] } }),
    );
    const results = resolveSkills(makeCtx({ intent: { type: 'greeting', confidence: 0.9 } }));
    expect(results).toHaveLength(0);
  });

  // T4: Keyword case-insensitive match
  it('matches keyword trigger case-insensitively', () => {
    _registerSkillForTesting(
      makeSkill({
        slug: 'objection-handler',
        trigger: { mode: 'keyword', keywords: ['EXPENSIVE'] },
      }),
    );
    const results = resolveSkills(
      makeCtx({ messageText: 'That seems expensive to me', artifactType: 'sales' }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('objection-handler');
  });

  // T5: Conflict keeps higher priority, drops lower
  it('keeps higher-priority skill and drops conflicting lower-priority skill', () => {
    _registerSkillForTesting(
      makeSkill({
        slug: 'skill-a',
        priority: 10,
        conflicts_with: ['skill-b'],
        trigger: { mode: 'always' },
      }),
    );
    _registerSkillForTesting(
      makeSkill({ slug: 'skill-b', priority: 5, trigger: { mode: 'always' } }),
    );
    const results = resolveSkills(makeCtx());
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain('skill-a');
    expect(slugs).not.toContain('skill-b');
  });

  // T6: Token budget drops skill that exceeds cap
  it('drops skill that would exceed the token budget cap', () => {
    // skill-a: 500 tokens (fits within 800 cap)
    _registerSkillForTesting(
      makeSkill({
        slug: 'skill-a',
        priority: 10,
        token_budget: 500,
        trigger: { mode: 'always' },
      }),
    );
    // skill-b: 400 tokens (500+400=900 > 800 cap, should be dropped)
    _registerSkillForTesting(
      makeSkill({
        slug: 'skill-b',
        priority: 5,
        token_budget: 400,
        trigger: { mode: 'always' },
      }),
    );
    expect(SKILL_TOKEN_CAP).toBe(800);
    const results = resolveSkills(makeCtx());
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain('skill-a');
    expect(slugs).not.toContain('skill-b');
  });

  // T7: mode:intent fires when intent matches, regardless of message text
  it('intent mode fires when intent matches even without keyword in message', () => {
    _registerSkillForTesting(
      makeSkill({
        slug: 'objection-style',
        trigger: { mode: 'intent', intents: ['objection'], keywords: ['competitor'] },
      }),
    );
    const results = resolveSkills(
      makeCtx({ intent: { type: 'objection', confidence: 0.9 }, messageText: 'I have concerns' }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('objection-style');
  });

  // T8: mode:intent keyword fallback fires when intent doesn't match but keyword appears
  it('intent mode keyword fallback fires when intent does not match but keyword appears', () => {
    _registerSkillForTesting(
      makeSkill({
        slug: 'objection-style',
        trigger: { mode: 'intent', intents: ['objection'], keywords: ['competitor'] },
      }),
    );
    const results = resolveSkills(
      makeCtx({ intent: { type: 'greeting', confidence: 0.9 }, messageText: 'We use a competitor' }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.slug).toBe('objection-style');
  });

  // T9: mode:intent does NOT fire when neither intent nor keyword matches
  it('intent mode does not fire when neither intent nor keyword matches', () => {
    _registerSkillForTesting(
      makeSkill({
        slug: 'objection-style',
        trigger: { mode: 'intent', intents: ['objection'], keywords: ['competitor'] },
      }),
    );
    const results = resolveSkills(
      makeCtx({ intent: { type: 'greeting', confidence: 0.9 }, messageText: 'Hello there' }),
    );
    expect(results).toHaveLength(0);
  });
});
