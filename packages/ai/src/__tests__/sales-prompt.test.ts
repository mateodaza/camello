import { describe, it, expect } from 'vitest';
import { ARCHETYPE_PROMPTS } from '../archetype-prompts.js';
import { buildSystemPrompt } from '../prompt-builder.js';
import type { RagChunk, Intent } from '@camello/shared/types';

// archetype-prompts.ts already imports './archetypes/index.js' as a side-effect,
// so no additional import is needed to populate ARCHETYPE_PROMPTS.

describe('Sales archetype prompt — NC-246 quality upgrade', () => {
  it('(1) includes SPIN-adapted discovery framework', () => {
    // Direct check on the raw prompt string — no artifact context needed.
    const prompt = ARCHETYPE_PROMPTS.sales!.en;
    expect(prompt).toContain('DISCOVERY');
  });

  it('(2) includes business-context adaptation instruction', () => {
    // Direct check on the raw prompt string — no artifact context needed.
    const prompt = ARCHETYPE_PROMPTS.sales!.en;
    expect(prompt).toContain('BUSINESS CONTEXT');
  });

  it('(3) buildSystemPrompt for sales type + greeting:regex intent includes the framework', () => {
    // Framework injection (prompt-builder.ts:83) requires TWO conditions:
    //   (a) profile.includeArchetypeFramework === true
    //       → satisfied by greeting:regex profile (intent-profiles.ts:46)
    //   (b) artifact.type is truthy and !== 'custom'
    //       → satisfied by type: 'sales' below
    // BOTH must be present. Omitting artifact.type causes framework to be skipped.
    const greetingIntent: Intent = {
      type: 'greeting',
      confidence: 1.0,
      complexity: 'simple',
      requires_knowledge_base: false,
      sentiment: 'neutral',
      source: 'regex',
    };

    const salesCtx = {
      artifact: {
        name: 'Alex',
        role: 'sales consultant',
        type: 'sales',           // REQUIRED — framework gated on this (see condition b above)
        personality: { tone: 'confident', language: 'en' },
        constraints: { hard_rules: [] as string[] },
        config: {},
        companyName: 'Acme Corp',
      },
      ragContext: [] as RagChunk[],
      learnings: [] as string[],
      intent: greetingIntent,
    };

    const prompt = buildSystemPrompt(salesCtx);
    expect(prompt).toContain('BEHAVIORAL FRAMEWORK');
    expect(prompt).toContain('DISCOVERY');
  });
});
