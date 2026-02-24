import { generateObject } from 'ai';
import { z } from 'zod';
import { createLLMClient } from './openrouter-client.js';
import { MODEL_MAP } from '@camello/shared/constants';
import type { Intent } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroundingInput {
  responseText: string;
  ragContext: string[];
  intent: Intent;
  locale?: string;
}

export interface GroundingResult {
  passed: boolean;
  violation?: string;
  safeResponse?: string;
  tokensIn: number;
  tokensOut: number;
  modelUsed: string;
}

// ---------------------------------------------------------------------------
// Schema for LLM structured output
// ---------------------------------------------------------------------------

const groundingSchema = z.object({
  grounded: z.boolean().describe(
    'true if the response only contains information supported by the provided context, or is a general conversational reply. false if it claims specific facts about services, products, or pricing not in the context.',
  ),
  violation: z.string().optional().describe(
    'If grounded is false, describe the specific unsupported claim (max 200 chars).',
  ),
});

// ---------------------------------------------------------------------------
// Safe fallback responses
// ---------------------------------------------------------------------------

const SAFE_FALLBACKS: Record<string, string> = {
  en: "I'd love to help you with that! I don't have specific details about our services right now. Let me connect you with our team so they can give you accurate information.",
  es: '¡Me encantaría ayudarte con eso! No tengo detalles específicos sobre nuestros servicios en este momento. Permíteme conectarte con nuestro equipo para que te den información precisa.',
};

// ---------------------------------------------------------------------------
// Skip logic
// ---------------------------------------------------------------------------

/** Intents where the response is purely social (no factual claims expected). */
const SKIP_GROUNDING_INTENTS = ['farewell', 'thanks'] as const;

/**
 * Determine if grounding check should run.
 * Skip for pure farewells/thanks (no factual claims expected).
 * Skip for regex-matched greetings (bare "hola", no question attached).
 * Run for everything else — especially when RAG returned empty.
 */
export function shouldCheckGrounding(intent: Intent, _ragContext: string[]): boolean {
  if ((SKIP_GROUNDING_INTENTS as readonly string[]).includes(intent.type)) {
    return false;
  }
  // Regex-matched greeting = bare greeting (Layer 1 guarantees no follow-up question)
  if (intent.type === 'greeting' && intent.source === 'regex') {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main grounding check
// ---------------------------------------------------------------------------

export async function checkGrounding(input: GroundingInput): Promise<GroundingResult> {
  const { responseText, ragContext, locale } = input;
  const modelId = MODEL_MAP.fast;

  const contextDescription = ragContext.length > 0
    ? `AVAILABLE KNOWLEDGE CONTEXT:\n${ragContext.join('\n\n')}`
    : 'AVAILABLE KNOWLEDGE CONTEXT: NONE (no knowledge documents were retrieved)';

  const client = createLLMClient();

  const { object, usage } = await generateObject({
    model: client(modelId),
    schema: groundingSchema,
    prompt: `You are a grounding validator. Check if the following AI response contains any unsupported factual claims.

${contextDescription}

AI RESPONSE TO CHECK:
"${responseText}"

RULES:
- If the response claims specific services, products, pricing, features, or offerings that are NOT in the knowledge context above, mark as NOT grounded.
- General conversational replies (greetings, offers to help, acknowledgments) are always grounded.
- Phrases like "I can help you with..." followed by specific service claims that aren't in the context = NOT grounded.
- Phrases like "I don't have that information" or "let me connect you with the team" = grounded.
- If the knowledge context is NONE, ANY specific claim about services/products/pricing is NOT grounded.`,
  });

  if (object.grounded) {
    return {
      passed: true,
      tokensIn: usage?.promptTokens ?? 0,
      tokensOut: usage?.completionTokens ?? 0,
      modelUsed: modelId,
    };
  }

  const fallbackLocale = (locale && SAFE_FALLBACKS[locale]) ? locale : 'en';

  return {
    passed: false,
    violation: object.violation?.slice(0, 200),
    safeResponse: SAFE_FALLBACKS[fallbackLocale],
    tokensIn: usage?.promptTokens ?? 0,
    tokensOut: usage?.completionTokens ?? 0,
    modelUsed: modelId,
  };
}
