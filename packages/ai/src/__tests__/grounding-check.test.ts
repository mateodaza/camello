import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  createLLMClient: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mocks.generateObject,
}));

vi.mock('../openrouter-client.js', () => ({
  createLLMClient: mocks.createLLMClient,
}));

vi.mock('@camello/shared/constants', () => ({
  MODEL_MAP: { fast: 'google/gemini-2.0-flash-001' },
}));

import { checkGrounding, shouldCheckGrounding } from '../grounding-check.js';
import type { Intent } from '@camello/shared/types';

const makeIntent = (overrides?: Partial<Intent>): Intent => ({
  type: 'general_inquiry',
  confidence: 0.9,
  complexity: 'simple',
  requires_knowledge_base: true,
  sentiment: 'neutral',
  source: 'llm',
  ...overrides,
});

describe('shouldCheckGrounding', () => {
  it('skips farewell intents', () => {
    expect(shouldCheckGrounding(makeIntent({ type: 'farewell' }), [])).toBe(false);
  });

  it('skips thanks intents', () => {
    expect(shouldCheckGrounding(makeIntent({ type: 'thanks' }), [])).toBe(false);
  });

  it('skips regex-matched greeting (bare greeting)', () => {
    expect(shouldCheckGrounding(
      makeIntent({ type: 'greeting', source: 'regex' }),
      [],
    )).toBe(false);
  });

  it('runs for LLM-classified greeting (had follow-up content)', () => {
    expect(shouldCheckGrounding(
      makeIntent({ type: 'greeting', source: 'llm' }),
      [],
    )).toBe(true);
  });

  it('runs for general_inquiry with empty RAG', () => {
    expect(shouldCheckGrounding(makeIntent({ type: 'general_inquiry' }), [])).toBe(true);
  });

  it('runs for product_question with RAG', () => {
    expect(shouldCheckGrounding(
      makeIntent({ type: 'product_question' }),
      ['Some product info'],
    )).toBe(true);
  });

  it('runs for pricing intent', () => {
    expect(shouldCheckGrounding(makeIntent({ type: 'pricing' }), [])).toBe(true);
  });
});

describe('checkGrounding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createLLMClient.mockReturnValue((model: string) => ({ modelId: model }));
  });

  it('returns passed:true when LLM says grounded', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { grounded: true },
      usage: { promptTokens: 100, completionTokens: 20 },
    });

    const result = await checkGrounding({
      responseText: 'Hello! How can I help you today?',
      ragContext: [],
      intent: makeIntent(),
    });

    expect(result.passed).toBe(true);
    expect(result.safeResponse).toBeUndefined();
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(20);
    expect(result.modelUsed).toBe('google/gemini-2.0-flash-001');
  });

  it('returns passed:false with safe response when LLM detects fabrication', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        grounded: false,
        violation: 'Claims "property management services" without context',
      },
      usage: { promptTokens: 150, completionTokens: 30 },
    });

    const result = await checkGrounding({
      responseText: 'We offer property management services!',
      ragContext: [],
      intent: makeIntent(),
    });

    expect(result.passed).toBe(false);
    expect(result.violation).toContain('property management');
    expect(result.safeResponse).toContain("I don't have specific details");
    expect(result.tokensIn).toBe(150);
    expect(result.tokensOut).toBe(30);
  });

  it('returns Spanish safe response when locale is "es"', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { grounded: false, violation: 'Fabricated services' },
      usage: { promptTokens: 100, completionTokens: 20 },
    });

    const result = await checkGrounding({
      responseText: 'Ofrecemos servicios de administración...',
      ragContext: [],
      intent: makeIntent(),
      locale: 'es',
    });

    expect(result.safeResponse).toContain('No tengo detalles específicos');
  });

  it('falls back to English safe response for unknown locale', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { grounded: false, violation: 'Fabricated' },
      usage: { promptTokens: 100, completionTokens: 20 },
    });

    const result = await checkGrounding({
      responseText: 'Fake services...',
      ragContext: [],
      intent: makeIntent(),
      locale: 'fr',
    });

    expect(result.safeResponse).toContain("I don't have specific details");
  });

  it('includes RAG context in the prompt when available', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { grounded: true },
      usage: { promptTokens: 200, completionTokens: 15 },
    });

    await checkGrounding({
      responseText: 'We offer web development!',
      ragContext: ['We offer web development and mobile apps.'],
      intent: makeIntent(),
    });

    const callArgs = mocks.generateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('We offer web development and mobile apps.');
    expect(callArgs.prompt).not.toContain('CONTEXT: NONE');
  });

  it('indicates empty context in prompt when no RAG docs', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { grounded: true },
      usage: { promptTokens: 100, completionTokens: 10 },
    });

    await checkGrounding({
      responseText: 'Hello!',
      ragContext: [],
      intent: makeIntent(),
    });

    const callArgs = mocks.generateObject.mock.calls[0][0];
    expect(callArgs.prompt).toContain('CONTEXT: NONE');
  });

  it('truncates violation to 200 chars', async () => {
    const longViolation = 'A'.repeat(300);
    mocks.generateObject.mockResolvedValue({
      object: { grounded: false, violation: longViolation },
      usage: { promptTokens: 100, completionTokens: 20 },
    });

    const result = await checkGrounding({
      responseText: 'Fake!',
      ragContext: [],
      intent: makeIntent(),
    });

    expect(result.violation!.length).toBe(200);
  });

  it('handles missing usage gracefully', async () => {
    mocks.generateObject.mockResolvedValue({
      object: { grounded: true },
      usage: undefined,
    });

    const result = await checkGrounding({
      responseText: 'Hello!',
      ragContext: [],
      intent: makeIntent(),
    });

    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
  });
});
