import type { ModelTier, PlanTier } from '../types/index.js';

// === Model Routing ===

export const MODEL_MAP: Record<ModelTier, string> = {
  fast: 'google/gemini-2.0-flash-001',
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

export const PLAN_PRICES: Record<PlanTier, { monthly: number; label: string }> = {
  starter: { monthly: 99, label: 'Starter' },
  growth: { monthly: 249, label: 'Growth' },
  scale: { monthly: 499, label: 'Scale' },
} as const;

export const COST_BUDGET_DEFAULTS: Record<PlanTier, number> = {
  starter: 5.0,
  growth: 25.0,
  scale: 100.0,
} as const;

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
  // Only exact-match patterns — safe, zero false-positives
  greeting: [/^(hi|hello|hey|hola)\s*[!?.,]*\s*$/i],
  farewell: [/^(bye|goodbye|see you|thanks|thank you)\s*[!?.,]*\s*$/i],
};

// === RAG ===

export const INTENT_TO_DOC_TYPES: Record<string, string[]> = {
  pricing: ['pricing', 'plans', 'faq'],
  product_question: ['product', 'features', 'faq'],
  technical_support: ['docs', 'troubleshooting', 'faq'],
  booking_request: ['services', 'availability'],
};

export const NO_SEARCH_INTENTS = ['greeting', 'farewell', 'thanks'] as const;

// === RAG Search Thresholds ===

export const RAG_CONFIG = {
  primary: {
    similarity_threshold: 0.3,
    match_count: 8,
  },
  proactive: {
    similarity_threshold: 0.15,
    match_count: 4,
    max_docs: 2,
    max_tokens: 400, // taken from rag_context budget
  },
  mmr: {
    lambda: 0.7, // balance relevance vs diversity (1 = pure relevance)
    diversity_threshold: 0.85, // filter docs with cosine sim > this to each other
  },
  embedding_model: 'text-embedding-3-small',
  embedding_dimensions: 1536,
} as const;

// === Text Chunking ===

export const CHUNK_CONFIG = {
  target_tokens: 512,
  overlap_tokens: 50,
  // ~4 chars per token is a rough average for English text
  chars_per_token: 4,
  min_chunk_chars: 100,
} as const;

// === Knowledge Ingestion Limits (per plan tier) ===

export const INGESTION_LIMITS: Record<PlanTier, {
  max_ingestions_per_day: number;
  max_text_size_bytes: number;
  max_pdf_size_bytes: number;
  max_chunks_per_source: number;
  max_thread_depth: number;
}> = {
  starter: {
    max_ingestions_per_day: 10,
    max_text_size_bytes: 50 * 1024,       // 50KB
    max_pdf_size_bytes: 10 * 1024 * 1024, // 10MB
    max_chunks_per_source: 50,
    max_thread_depth: 10,
  },
  growth: {
    max_ingestions_per_day: 50,
    max_text_size_bytes: 100 * 1024,      // 100KB
    max_pdf_size_bytes: 25 * 1024 * 1024, // 25MB
    max_chunks_per_source: 200,
    max_thread_depth: 25,
  },
  scale: {
    max_ingestions_per_day: 200,
    max_text_size_bytes: 500 * 1024,      // 500KB
    max_pdf_size_bytes: 50 * 1024 * 1024, // 50MB
    max_chunks_per_source: 500,
    max_thread_depth: 50,
  },
} as const;

// === Feedback Loop Confidence ===

export const LEARNING_CONFIDENCE = {
  initial: 0.8,
  policy_violation_initial: 1.0,
  increment_per_rejection: 0.1,
  monthly_decay: 0.05,
  retrieval_floor: 0.5,   // below this, learning excluded from RAG
  archive_threshold: 0.3,  // below this, learning archived
  max: 1.0,
} as const;

export const REJECTION_REASONS = [
  'false_positive',
  'wrong_target',
  'bad_timing',
  'incorrect_data',
  'policy_violation',
] as const;

// === Module Slugs ===
// Closed set of registered module slugs. Update when a new module is added to packages/ai/src/modules/.
export const MODULE_SLUGS = [
  'qualify_lead',
  'book_meeting',
  'collect_payment',
  'send_quote',
  'create_ticket',
  'escalate_to_human',
  'send_followup',
  'capture_interest',
  'draft_content',
] as const;
