/**
 * Intent profiles — single source of truth for context curation.
 *
 * Controls what goes into the context window based on intent classification.
 * Every generation-time decision (prompt sections, tool filtering, token limits,
 * step budget, grounding behavior) is derived from these profiles.
 */
import type { Intent, IntentType } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Profile shape
// ---------------------------------------------------------------------------

export interface IntentProfile {
  /** Include archetype behavioral framework (sales techniques, objection handling, etc.) */
  includeArchetypeFramework: boolean;
  /** Include module tool definitions in prompt + tools param */
  includeModules: boolean;
  /** If set, only these module slugs are exposed (undefined = all bound modules) */
  allowedModuleSlugs?: string[];
  /** Max tool-calling steps for generateText */
  maxSteps: number;
  /** Hard cap on output tokens (Vercel AI SDK maxTokens) */
  maxResponseTokens: number;
  /** Max sentences instruction injected into system prompt */
  maxSentences: number;
  /** Whether grounding check can be skipped entirely */
  skipGrounding: boolean;
}

// ---------------------------------------------------------------------------
// Buffer for invisible memory tags appended to response
// [MEMORY:name=Carlos] ≈ 25 tokens. Allow headroom.
// ---------------------------------------------------------------------------

const MEMORY_TAG_BUFFER = 40;

// ---------------------------------------------------------------------------
// Profile definitions
// ---------------------------------------------------------------------------

const PROFILES: Record<string, IntentProfile> = {
  // --- Lightweight intents (no framework, no tools, minimal output) ---
  'greeting:regex': {
    includeArchetypeFramework: false,
    includeModules: false,
    maxSteps: 1,
    maxResponseTokens: 100 + MEMORY_TAG_BUFFER,
    maxSentences: 2,
    skipGrounding: true,
  },
  farewell: {
    includeArchetypeFramework: false,
    includeModules: false,
    maxSteps: 1,
    maxResponseTokens: 80 + MEMORY_TAG_BUFFER,
    maxSentences: 2,
    skipGrounding: true,
  },
  thanks: {
    includeArchetypeFramework: false,
    includeModules: false,
    maxSteps: 1,
    maxResponseTokens: 80 + MEMORY_TAG_BUFFER,
    maxSentences: 2,
    skipGrounding: true,
  },

  // --- LLM-classified greeting (may have follow-up question embedded) ---
  'greeting:llm': {
    includeArchetypeFramework: false,
    includeModules: true,
    allowedModuleSlugs: ['qualify_lead'],
    maxSteps: 3,
    maxResponseTokens: 200 + MEMORY_TAG_BUFFER,
    maxSentences: 3,
    skipGrounding: false,
  },

  // --- Simple intents (tools scoped, no framework) ---
  simple_question: {
    includeArchetypeFramework: false,
    includeModules: false,
    maxSteps: 1,
    maxResponseTokens: 250 + MEMORY_TAG_BUFFER,
    maxSentences: 4,
    skipGrounding: false,
  },
  availability: {
    includeArchetypeFramework: false,
    includeModules: true,
    allowedModuleSlugs: ['book_meeting'],
    maxSteps: 3,
    maxResponseTokens: 200 + MEMORY_TAG_BUFFER,
    maxSentences: 4,
    skipGrounding: false,
  },
  booking_request: {
    includeArchetypeFramework: false,
    includeModules: true,
    allowedModuleSlugs: ['book_meeting'],
    maxSteps: 3,
    maxResponseTokens: 250 + MEMORY_TAG_BUFFER,
    maxSentences: 4,
    skipGrounding: false,
  },

  // --- Medium intents (framework + scoped tools) ---
  pricing: {
    includeArchetypeFramework: true,
    includeModules: true,
    allowedModuleSlugs: ['qualify_lead', 'send_quote', 'collect_payment'],
    maxSteps: 3,
    maxResponseTokens: 350 + MEMORY_TAG_BUFFER,
    maxSentences: 5,
    skipGrounding: false,
  },
  product_question: {
    includeArchetypeFramework: true,
    includeModules: true,
    allowedModuleSlugs: ['qualify_lead', 'send_quote'],
    maxSteps: 3,
    maxResponseTokens: 350 + MEMORY_TAG_BUFFER,
    maxSentences: 5,
    skipGrounding: false,
  },
  general_inquiry: {
    includeArchetypeFramework: true,
    includeModules: true,
    maxSteps: 3,
    maxResponseTokens: 300 + MEMORY_TAG_BUFFER,
    maxSentences: 5,
    skipGrounding: false,
  },
  followup: {
    includeArchetypeFramework: true,
    includeModules: true,
    maxSteps: 3,
    maxResponseTokens: 300 + MEMORY_TAG_BUFFER,
    maxSentences: 5,
    skipGrounding: false,
  },

  // --- Complex intents (full framework, all tools, generous limits) ---
  complaint: {
    includeArchetypeFramework: true,
    includeModules: true,
    allowedModuleSlugs: ['create_ticket', 'escalate_to_human'],
    maxSteps: 5,
    maxResponseTokens: 400 + MEMORY_TAG_BUFFER,
    maxSentences: 6,
    skipGrounding: false,
  },
  negotiation: {
    includeArchetypeFramework: true,
    includeModules: true,
    maxSteps: 5,
    maxResponseTokens: 400 + MEMORY_TAG_BUFFER,
    maxSentences: 6,
    skipGrounding: false,
  },
  escalation_request: {
    includeArchetypeFramework: true,
    includeModules: true,
    allowedModuleSlugs: ['create_ticket', 'escalate_to_human'],
    maxSteps: 3,
    maxResponseTokens: 250 + MEMORY_TAG_BUFFER,
    maxSentences: 4,
    skipGrounding: false,
  },
  technical_support: {
    includeArchetypeFramework: true,
    includeModules: true,
    allowedModuleSlugs: ['create_ticket', 'escalate_to_human'],
    maxSteps: 5,
    maxResponseTokens: 400 + MEMORY_TAG_BUFFER,
    maxSentences: 6,
    skipGrounding: false,
  },
};

// Fallback for any unknown intent type
const DEFAULT_PROFILE: IntentProfile = {
  includeArchetypeFramework: true,
  includeModules: true,
  maxSteps: 3,
  maxResponseTokens: 300 + MEMORY_TAG_BUFFER,
  maxSentences: 5,
  skipGrounding: false,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the intent profile — single source of truth for all curation decisions.
 *
 * Greeting is split by source (regex = bare "hi", llm = "hi, what do you sell?")
 * because they need very different context budgets.
 */
export function getIntentProfile(intent: Intent): IntentProfile {
  // Greeting splits by detection source
  if (intent.type === 'greeting') {
    return PROFILES[`greeting:${intent.source}`] ?? DEFAULT_PROFILE;
  }
  return PROFILES[intent.type] ?? DEFAULT_PROFILE;
}

// ---------------------------------------------------------------------------
// Claim-sensitive grounding (caution #2 from review)
// ---------------------------------------------------------------------------

/**
 * Regex patterns that indicate the response contains specific factual claims,
 * regardless of what the intent classifier said. A "simple_question" that
 * triggers pricing claims still needs grounding.
 */
const CLAIM_PATTERNS = [
  /\$\d/,                          // dollar amounts
  /\d+\s*%\s*(off|discount)/i,    // percentage discounts
  /starting at|starts at|from \$/i, // pricing language
  /our\s+(plan|package|tier|product|service)s?\s+(include|offer|feature|provide)/i,
  /(?:basic|starter|pro|premium|enterprise|growth|scale)\s+plan/i, // plan tier names
  /per\s+month|\/mo|monthly|annually/i, // billing terms
];

/**
 * Check whether a response contains specific factual claims that need grounding,
 * independent of intent classification. This makes fail-closed behavior
 * claim-sensitive, not just intent-sensitive.
 */
export function responseContainsClaims(responseText: string): boolean {
  return CLAIM_PATTERNS.some((p) => p.test(responseText));
}

/**
 * High-risk intents where grounding check errors should fail-closed
 * (replace with safe fallback instead of letting through unchecked).
 */
const HIGH_RISK_INTENTS: ReadonlySet<IntentType> = new Set([
  'pricing',
  'product_question',
  'technical_support',
]);

export function isHighRiskIntent(intentType: string): boolean {
  return HIGH_RISK_INTENTS.has(intentType as IntentType);
}
