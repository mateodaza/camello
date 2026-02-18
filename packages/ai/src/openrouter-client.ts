import { createOpenRouter } from '@openrouter/ai-sdk-provider';

let _client: ReturnType<typeof createOpenRouter> | null = null;

/**
 * Singleton OpenRouter client.
 * Uses OpenRouter as the LLM gateway (200+ models, single API key, auto-fallback).
 */
export function createLLMClient() {
  if (!_client) {
    _client = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY!,
    });
  }
  return _client;
}
