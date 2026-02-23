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

  it('produces Spanish prompt when locale is "es"', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, locale: 'es' });
    expect(prompt).toContain('Eres Sofia');
    expect(prompt).toContain('REGLAS DE SEGURIDAD CRÍTICAS');
    expect(prompt).toContain('REGLAS ESTRICTAS (nunca romper)');
  });

  it('falls back to English for unknown locale', () => {
    const prompt = buildSystemPrompt({ ...baseCtx, locale: 'fr' });
    expect(prompt).toContain('You are Sofia');
    expect(prompt).toContain('CRITICAL SAFETY RULES');
  });

  it('includes Spanish module instructions when locale is "es"', () => {
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
    expect(prompt).toContain('ACCIONES DISPONIBLES');
    expect(prompt).toContain('(requiere aprobación del equipo)');
    expect(prompt).toContain('REGLAS PARA ACCIONES');
  });

  it('includes Spanish RAG + learnings headers when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      ragContext: ['Product info here'],
      learnings: ['Customers prefer quick answers'],
    });
    expect(prompt).toContain('CONTEXTO DE CONOCIMIENTO');
    expect(prompt).toContain('FIN CONTEXTO DE CONOCIMIENTO');
    expect(prompt).toContain('APRENDIZAJES');
    expect(prompt).toContain('FIN APRENDIZAJES');
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

  it('includes support archetype framework in Spanish when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      artifact: { ...baseCtx.artifact, type: 'support' },
    });
    expect(prompt).toContain('MARCO DE COMPORTAMIENTO');
    expect(prompt).toContain('AGENTE DE SOPORTE');
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

  it('includes Spanish custom instructions header when locale is "es"', () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      locale: 'es',
      artifact: {
        ...baseCtx.artifact,
        personality: { ...baseCtx.artifact.personality, instructions: 'Siempre recomienda el plan premium' },
      },
    });
    expect(prompt).toContain('INSTRUCCIONES ADICIONALES DE TU EQUIPO');
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
