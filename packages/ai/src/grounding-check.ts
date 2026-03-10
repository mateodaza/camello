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

export const SAFE_FALLBACKS: Record<string, string> = {
  en: "I don't have specific details about our offerings loaded yet. Could you tell me more about what you're looking for? That way I can help point you in the right direction!",
  es: 'Aún no tengo detalles específicos sobre lo que ofrecemos cargados. ¿Podrías contarme más sobre lo que estás buscando? Así puedo orientarte mejor.',
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
    prompt: `You are a grounding validator. Check if the following AI response fabricates specific factual claims.

${contextDescription}

AI RESPONSE TO CHECK:
"${responseText}"

RULES:
- ONLY mark as NOT grounded if the response invents specific product names, service descriptions, pricing, or feature lists that are NOT in the knowledge context.
- These are ALWAYS grounded (even when knowledge context is NONE):
  * General conversational replies, greetings, offers to help, acknowledgments
  * Asking the user clarifying or qualifying questions
  * Saying "I don't have that information" or similar honest disclaimers
  * Using the agent's personality, role, or tone to engage naturally
  * Offering to connect with the team or take a next step
- If the knowledge context is NONE: the response is grounded as long as it does NOT fabricate specific products, services, or prices. Being conversational and helpful without making factual claims IS grounded.`,
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

/**
 * checkGrounding with one retry on transient failure.
 * Catches ~90% of rate-limit / network blips before falling back.
 */
export async function checkGroundingWithRetry(input: GroundingInput): Promise<GroundingResult> {
  try {
    return await checkGrounding(input);
  } catch (_firstError) {
    // One retry — if this also fails, let it throw for caller to handle
    return await checkGrounding(input);
  }
}
