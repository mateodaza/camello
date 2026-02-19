import { generateObject } from 'ai';
import { intentSchema } from '@camello/shared/schemas';
import { REGEX_INTENTS } from '@camello/shared/constants';
import type { Intent } from '@camello/shared/types';
import { createLLMClient } from './openrouter-client.js';

/**
 * 2-pass intent classification (from CHEZ pattern):
 * Pass 1: Regex (zero cost, <1ms)
 * Pass 2: LLM via cheapest model (only when regex fails)
 */
export async function classifyIntent(message: string): Promise<Intent> {
  // Pass 1: Regex
  const regexResult = classifyByRegex(message);
  if (regexResult) return regexResult;

  // Pass 2: LLM
  return classifyByLLM(message);
}

function classifyByRegex(message: string): Intent | null {
  for (const [type, patterns] of Object.entries(REGEX_INTENTS)) {
    if (patterns.some(p => p.test(message))) {
      return {
        type: type as Intent['type'],
        confidence: 0.85,
        complexity: 'simple',
        requires_knowledge_base: false,
        sentiment: 'neutral',
        source: 'regex',
      };
    }
  }
  return null;
}

async function classifyByLLM(message: string): Promise<Intent> {
  const client = createLLMClient();

  const { object } = await generateObject({
    model: client('google/gemini-2.0-flash-001'),
    schema: intentSchema,
    prompt: `Classify the intent of this customer message. Consider the type, complexity, sentiment, and whether it needs a knowledge base lookup.\n\nMessage: "${message}"`,
  });

  return { ...object, source: 'llm' };
}
