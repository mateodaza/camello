export { classifyIntent } from './intent-classifier.js';
export { selectModel } from './model-selector.js';
export { buildSystemPrompt } from './prompt-builder.js';
export { createLLMClient } from './openrouter-client.js';
export { generateEmbedding, generateEmbeddings } from './embedding.js';
export { chunkText, estimateTokens } from './chunker.js';
export { searchKnowledge } from './rag.js';
export type { MatchKnowledgeFn, EmbedFn, RagSearchInput } from './rag.js';
export { ingestKnowledge, IngestionLimitError } from './knowledge-ingestion.js';
export type { InsertChunksFn, GetIngestionCountTodayFn, IngestionInput, IngestionResult } from './knowledge-ingestion.js';
export { createArtifactResolver } from './artifact-resolver.js';
export type { ResolverDeps } from './artifact-resolver.js';
export { processRejection, applyConfidenceDecay, isValidRejectionReason } from './feedback-loop.js';
export type { RejectionInput, LearningRecord, FeedbackDeps } from './feedback-loop.js';

// Module executor system
export { registerModule, getModule, getAllModules, getRegisteredSlugs, getQuickActionsForModules, _clearRegistry } from './module-registry.js';
export type { ModuleDefinition } from './module-registry.js';
export { buildToolsFromBindings } from './tool-adapter.js';
export type { ToolAdapterDeps } from './tool-adapter.js';

// Grounding check (post-generation hallucination prevention)
export { checkGrounding, shouldCheckGrounding } from './grounding-check.js';
export type { GroundingInput, GroundingResult } from './grounding-check.js';

// Archetype differentiation
export {
  ARCHETYPE_PROMPTS,
  ARCHETYPE_DEFAULT_TONES,
  ARCHETYPE_MODULE_SLUGS,
} from './archetype-prompts.js';

// Side-effect: registers built-in modules (qualify_lead, book_meeting, send_followup)
import './modules/index.js';
