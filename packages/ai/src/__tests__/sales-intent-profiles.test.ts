import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../prompt-builder.js';
import { getIntentProfile } from '../intent-profiles.js';
import type { RagChunk, Intent } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const salesCtx = {
  artifact: {
    name: 'Alex',
    role: 'sales consultant',
    type: 'sales',
    personality: { tone: 'confident', language: 'en' },
    constraints: { hard_rules: [] as string[] },
    config: {},
    companyName: 'Acme Corp',
  },
  ragContext: [] as RagChunk[],
  learnings: [] as string[],
};

const greetingRegexIntent: Intent = {
  type: 'greeting',
  source: 'regex',
  confidence: 1.0,
  complexity: 'simple',
  requires_knowledge_base: false,
  sentiment: 'neutral',
};

const simpleQuestionIntent: Intent = {
  type: 'simple_question',
  source: 'llm',
  confidence: 1.0,
  complexity: 'simple',
  requires_knowledge_base: false,
  sentiment: 'neutral',
};

const farewellIntent: Intent = {
  type: 'farewell',
  source: 'regex',
  confidence: 1.0,
  complexity: 'simple',
  requires_knowledge_base: false,
  sentiment: 'neutral',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getIntentProfile — intent-driven context curation', () => {
  it('greeting:regex returns includeArchetypeFramework: true', () => {
    const profile = getIntentProfile(greetingRegexIntent);
    expect(profile.includeArchetypeFramework).toBe(true);
  });

  it('farewell returns includeArchetypeFramework: false', () => {
    const profile = getIntentProfile(farewellIntent);
    expect(profile.includeArchetypeFramework).toBe(false);
  });
});

describe('buildSystemPrompt — sales artifact with intent profiles', () => {
  it('greeting:regex includes "BEHAVIORAL FRAMEWORK"', () => {
    const prompt = buildSystemPrompt({ ...salesCtx, intent: greetingRegexIntent });
    expect(prompt).toContain('BEHAVIORAL FRAMEWORK');
  });

  it('greeting:regex includes "PROACTIVE ENGAGEMENT"', () => {
    const prompt = buildSystemPrompt({ ...salesCtx, intent: greetingRegexIntent });
    expect(prompt).toContain('PROACTIVE ENGAGEMENT');
  });

  it('simple_question includes archetype framework', () => {
    const prompt = buildSystemPrompt({ ...salesCtx, intent: simpleQuestionIntent });
    expect(prompt).toContain('BEHAVIORAL FRAMEWORK');
  });

  it('farewell does NOT include archetype framework', () => {
    const prompt = buildSystemPrompt({ ...salesCtx, intent: farewellIntent });
    expect(prompt).not.toContain('BEHAVIORAL FRAMEWORK');
  });
});

describe('buildSystemPrompt — customer memory agent-name filter', () => {
  it('filters out name fact when value matches artifact name (case-insensitive)', () => {
    // Use uppercase to verify the filter is truly case-insensitive, not just exact-match
    const prompt = buildSystemPrompt({
      ...salesCtx,
      customerMemory: [{ key: 'name', value: 'ALEX' }],
    });
    expect(prompt).not.toContain('- name: ALEX');
    expect(prompt).not.toContain('CUSTOMER CONTEXT');
  });

  it('keeps name fact when value does NOT match artifact name', () => {
    const prompt = buildSystemPrompt({
      ...salesCtx,
      customerMemory: [{ key: 'name', value: 'Maria' }],
    });
    expect(prompt).toContain('- name: Maria');
  });
});
