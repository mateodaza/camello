import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../prompt-builder.js';

const baseCtx = {
  artifact: {
    name: 'Sofia',
    role: 'sales assistant',
    personality: { tone: 'friendly', language: 'es' },
    constraints: { hard_rules: ['Never discuss competitors'] },
    config: {},
    companyName: 'Acme Corp',
  },
  ragContext: [],
  learnings: [],
};

describe('buildSystemPrompt', () => {
  it('produces English prompt by default (no locale)', () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).toContain('You are Sofia');
    expect(prompt).toContain('CRITICAL SAFETY RULES');
    expect(prompt).toContain('HARD RULES (never break)');
  });

  it('produces English prompt when locale is "en"', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, locale: 'en' });
    expect(prompt).toContain('You are Sofia');
    expect(prompt).toContain('CRITICAL SAFETY RULES');
  });

  it('uses English scaffolding even when locale is "es" (language rule handles response lang)', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, locale: 'es' });
    expect(prompt).toContain('You are Sofia');
    expect(prompt).toContain('CRITICAL SAFETY RULES');
    expect(prompt).toContain('LANGUAGE RULE (NON-NEGOTIABLE)');
  });

  it('falls back to English for unknown locale', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, locale: 'fr' });
    expect(prompt).toContain('You are Sofia');
    expect(prompt).toContain('CRITICAL SAFETY RULES');
  });

  it('includes English module instructions even when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      modules: [{
        name: 'Lead Capture',
        slug: 'lead_capture',
        description: 'Captures customer leads',
        autonomyLevel: 'draft_and_approve',
      }],
    });
    expect(prompt).toContain('AVAILABLE ACTIONS');
    expect(prompt).toContain('(requires team approval)');
    expect(prompt).toContain('RULES FOR ACTIONS');
  });

  it('includes English RAG + learnings headers even when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      ragContext: ['Product info here'],
      learnings: ['Customers prefer quick answers'],
    });
    expect(prompt).toContain('KNOWLEDGE CONTEXT');
    expect(prompt).toContain('END KNOWLEDGE CONTEXT');
    expect(prompt).toContain('LEARNINGS');
    expect(prompt).toContain('END LEARNINGS');
  });

  // --- Archetype framework ---

  it('includes sales archetype framework when type is "sales"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: { ...baseCtx.artifact, type: 'sales' },
    });
    expect(prompt).toContain('BEHAVIORAL FRAMEWORK');
    expect(prompt).toContain('qualify leads');
  });

  it('includes English archetype framework even when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      artifact: { ...baseCtx.artifact, type: 'support' },
    });
    expect(prompt).toContain('BEHAVIORAL FRAMEWORK');
    expect(prompt).toContain('SUPPORT AGENT');
  });

  it('does NOT include archetype framework for custom type', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: { ...baseCtx.artifact, type: 'custom' },
    });
    expect(prompt).not.toContain('BEHAVIORAL FRAMEWORK');
    expect(prompt).not.toContain('MARCO DE COMPORTAMIENTO');
  });

  it('does NOT include archetype framework when type is undefined', () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).not.toContain('BEHAVIORAL FRAMEWORK');
  });

  // --- Custom instructions ---

  it('includes custom instructions when provided', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: {
        ...baseCtx.artifact,
        personality: { ...baseCtx.artifact.personality, instructions: 'Always recommend our premium plan' },
      },
    });
    expect(prompt).toContain('ADDITIONAL INSTRUCTIONS FROM YOUR TEAM');
    expect(prompt).toContain('Always recommend our premium plan');
  });

  it('includes English custom instructions header even when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      artifact: {
        ...baseCtx.artifact,
        personality: { ...baseCtx.artifact.personality, instructions: 'Siempre recomienda el plan premium' },
      },
    });
    expect(prompt).toContain('ADDITIONAL INSTRUCTIONS FROM YOUR TEAM');
    expect(prompt).toContain('Siempre recomienda el plan premium');
  });

  it('omits custom instructions when empty', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: {
        ...baseCtx.artifact,
        personality: { ...baseCtx.artifact.personality, instructions: '' },
      },
    });
    expect(prompt).not.toContain('ADDITIONAL INSTRUCTIONS');
  });

  it('omits custom instructions when whitespace-only', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: {
        ...baseCtx.artifact,
        personality: { ...baseCtx.artifact.personality, instructions: '   ' },
      },
    });
    expect(prompt).not.toContain('ADDITIONAL INSTRUCTIONS');
  });

  // --- Empty-RAG warning ---

  it('injects empty-RAG warning when search attempted but no results (en)', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      ragContext: [],
      ragSearchAttempted: true,
    });
    expect(prompt).toContain('LIMITED KNOWLEDGE');
    expect(prompt).toContain('Do NOT invent or guess specific products');
  });

  it('injects English empty-RAG warning even when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      ragContext: [],
      ragSearchAttempted: true,
    });
    expect(prompt).toContain('LIMITED KNOWLEDGE');
    expect(prompt).toContain('Do NOT invent or guess specific products');
  });

  it('does NOT inject empty-RAG warning when search was skipped', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      ragContext: [],
      ragSearchAttempted: false,
    });
    expect(prompt).not.toContain('LIMITED KNOWLEDGE');
  });

  it('does NOT inject empty-RAG warning when ragSearchAttempted is undefined', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      ragContext: [],
    });
    expect(prompt).not.toContain('LIMITED KNOWLEDGE');
  });

  it('does NOT inject empty-RAG warning when proactive context has docs', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      ragContext: [],
      proactiveContext: ['Some tangentially relevant info'],
      ragSearchAttempted: true,
    });
    expect(prompt).not.toContain('LIMITED KNOWLEDGE');
    expect(prompt).toContain('PROACTIVE CONTEXT');
  });

  // --- Section ordering ---

  it('places archetype framework before personality (tone)', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: {
        ...baseCtx.artifact,
        type: 'sales',
        personality: { tone: 'friendly', language: 'es' },
      },
    });
    const frameworkIdx = prompt.indexOf('BEHAVIORAL FRAMEWORK');
    const toneIdx = prompt.indexOf('Tone: friendly');
    expect(frameworkIdx).toBeGreaterThan(-1);
    expect(toneIdx).toBeGreaterThan(-1);
    expect(frameworkIdx).toBeLessThan(toneIdx);
  });

  it('places custom instructions after personality (tone)', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      artifact: {
        ...baseCtx.artifact,
        personality: { tone: 'friendly', language: 'es', instructions: 'Custom rule' },
      },
    });
    const toneIdx = prompt.indexOf('Tone: friendly');
    const instructionsIdx = prompt.indexOf('ADDITIONAL INSTRUCTIONS');
    expect(toneIdx).toBeGreaterThan(-1);
    expect(instructionsIdx).toBeGreaterThan(-1);
    expect(toneIdx).toBeLessThan(instructionsIdx);
  });
});
