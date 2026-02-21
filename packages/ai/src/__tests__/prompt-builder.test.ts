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
});
