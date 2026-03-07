export { classifyIntent } from './intent-classifier.js';
export { selectModel } from './model-selector.js';
export { buildSystemPrompt } from './prompt-builder.js';
export { createLLMClient } from './openrouter-client.js';
export { generateEmbedding } from './embedding.js';
export { searchKnowledge } from './rag.js';
export type { MatchKnowledgeFn, EmbedFn } from './rag.js';
export { ingestKnowledge, IngestionLimitError } from './knowledge-ingestion.js';
export { createArtifactResolver } from './artifact-resolver.js';
export { processRejection, applyConfidenceDecay } from './feedback-loop.js';

// Module executor system
export { getModule, getQuickActionsForModules, type RiskTier } from './module-registry.js';
export { buildToolsFromBindings } from './tool-adapter.js';

// Grounding check (post-generation hallucination prevention)
export { checkGrounding, shouldCheckGrounding } from './grounding-check.js';

// Chunk role classification (RAG upgrade — intent-aware lead/support roles)
export { classifyChunkRole, flattenRagChunks } from './chunk-roles.js';
export type { ChunkRole } from './chunk-roles.js';

// Customer memory (cross-conversation context)
export {
  extractFactsRegex,
  sanitizeFactValue,
  mergeMemoryFacts,
  parseMemoryFacts,
  FACT_KEY_ALLOWLIST,
  MAX_STORED_FACTS,
  MAX_INJECTED_FACTS,
  MAX_FACT_VALUE_LENGTH,
} from './memory-extractor.js';

// Archetype registry (single-source-of-truth for per-type definitions)
export {
  getArchetype,
  getAllArchetypes,
  registerArchetype,
  type ArchetypeDefinition,
  type ArchetypeRagBias,
  type LocalizedText,
} from './archetype-registry.js';

// Backward-compatible archetype maps (computed from registry)
export {
  ARCHETYPE_PROMPTS,
  ARCHETYPE_DEFAULT_TONES,
  ARCHETYPE_MODULE_SLUGS,
} from './archetype-prompts.js';

// Side-effect: registers archetypes (sales, support, marketing, custom)
import './archetypes/index.js';

// Side-effect: registers built-in modules
import './modules/index.js';

export { summarizeConversation } from './summarize-conversation.js';
