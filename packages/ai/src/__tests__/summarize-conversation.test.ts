import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock('ai', () => ({ generateText: mocks.generateText }));
vi.mock('../openrouter-client.js', () => ({
  createLLMClient: vi.fn(() => vi.fn(() => 'mock-model')),
}));
vi.mock('@camello/shared/constants', () => ({
  MODEL_MAP: { fast: 'mock-fast-model', balanced: 'mock-balanced', powerful: 'mock-powerful' },
}));

import { summarizeConversation } from '../summarize-conversation.js';

const MSGS = [
  { role: 'user', content: 'I need help with pricing' },
  { role: 'assistant', content: 'Our pricing starts at $50/month' },
];

beforeEach(() => {
  mocks.generateText.mockReset();
});

describe('summarizeConversation', () => {
  it('1. Returns trimmed summary', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: '  summary  ' });
    const result = await summarizeConversation(MSGS, 'en');
    expect(result).toBe('summary');
  });

  it('2. Calls generateText with fast model', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: 'ok' });
    await summarizeConversation(MSGS, 'en');
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-model' }),
    );
  });

  it('3. Spanish prompt for locale=es', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: 'resumen' });
    await summarizeConversation(MSGS, 'es');
    const call = mocks.generateText.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('Resume');
  });

  it('4. English prompt for locale=en', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: 'summary' });
    await summarizeConversation(MSGS, 'en');
    const call = mocks.generateText.mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain('Summarize');
  });

  it('5. LLM error returns null (graceful failure)', async () => {
    mocks.generateText.mockRejectedValueOnce(new Error('LLM error'));
    const result = await summarizeConversation(MSGS, 'en');
    expect(result).toBeNull();
  });

  it('6. Empty messages list works — filters out system messages, still calls LLM', async () => {
    mocks.generateText.mockResolvedValueOnce({ text: 'empty summary' });
    const result = await summarizeConversation([], 'en');
    expect(result).toBe('empty summary');
    expect(mocks.generateText).toHaveBeenCalled();
  });
});
