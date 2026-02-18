import type { ModelTier, PlanTier } from '../types/index.js';

// === Model Routing ===

export const MODEL_MAP: Record<ModelTier, string> = {
  fast: 'google/gemini-2.0-flash-exp',
  balanced: 'openai/gpt-4o-mini',
  powerful: 'anthropic/claude-sonnet-4',
} as const;

export const MODEL_TIMEOUTS: Record<ModelTier, number> = {
  fast: 10_000,
  balanced: 15_000,
  powerful: 20_000,
} as const;

// === Plan Limits ===

export const PLAN_LIMITS: Record<PlanTier, {
  artifacts: number;
  modules: number;
  channels: number;
  resolutions_per_month: number;
}> = {
  starter: { artifacts: 1, modules: 3, channels: 2, resolutions_per_month: 500 },
  growth: { artifacts: 3, modules: 10, channels: 4, resolutions_per_month: 2_000 },
  scale: { artifacts: Infinity, modules: Infinity, channels: Infinity, resolutions_per_month: 5_000 },
} as const;

export const OVERAGE_COST_PER_RESOLUTION = 0.50;

// === Rate Limits ===

export const RATE_LIMITS = {
  messages_per_minute: 100,
  module_executions_per_minute: 10,
} as const;

// === RAG Token Budget ===

export const TOKEN_BUDGET = {
  system_prompt: 800,
  rag_context: 2400,
  conversation: 1600,
  learnings: 400,
  total: 5200,
} as const;

// === Module Execution ===

export const MODULE_TIMEOUT_MS = 10_000;

// === Intent Classification ===

export const REGEX_INTENTS: Record<string, RegExp[]> = {
  greeting: [/^(hi|hello|hey|hola)\b/i],
  pricing: [/pric(e|ing)|cost|how much|rate/i],
  availability: [/available|schedule|when can|book/i],
  complaint: [/complaint|unhappy|terrible|worst|refund/i],
  simple_question: [/^(what|where|who|when) (is|are|was)\b/i],
  farewell: [/^(bye|goodbye|see you|thanks|thank you)\b/i],
};

// === RAG ===

export const INTENT_TO_DOC_TYPES: Record<string, string[]> = {
  pricing: ['pricing', 'plans', 'faq'],
  product_question: ['product', 'features', 'faq'],
  technical_support: ['docs', 'troubleshooting', 'faq'],
  booking_request: ['services', 'availability'],
};

export const NO_SEARCH_INTENTS = ['greeting', 'farewell', 'thanks'] as const;
