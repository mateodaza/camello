import type { RagChunk } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Chunk Role Classification
// ---------------------------------------------------------------------------

export type ChunkRole = 'lead' | 'support';

/**
 * For each intent type, map doc_type values to their role in the response.
 * "lead" = primary source of truth for this intent (answer from these first).
 * "support" = supplementary context (use to enrich, not as primary facts).
 *
 * Unmapped intents treat all chunks as 'lead'.
 * Unmapped doc_types within a mapped intent default to 'lead'.
 */
export const INTENT_CHUNK_ROLES: Record<string, Record<string, ChunkRole>> = {
  pricing: { pricing: 'lead', plans: 'lead', faq: 'support', product: 'support' },
  product_question: { product: 'lead', features: 'lead', faq: 'support', pricing: 'support' },
  technical_support: { troubleshooting: 'lead', docs: 'lead', faq: 'support' },
  booking_request: { services: 'lead', availability: 'lead', faq: 'support' },
  complaint: { troubleshooting: 'lead', faq: 'support', docs: 'support' },
  general_inquiry: { faq: 'lead' },
};

/**
 * Classify a chunk's role based on the current intent and the chunk's doc_type.
 * Returns 'lead' for:
 *   - Unmapped intents (no entry in INTENT_CHUNK_ROLES)
 *   - Null doc_type (can't determine role without doc_type metadata)
 *   - Doc types not listed in the intent's role map
 */
export function classifyChunkRole(intentType: string, docType: string | null): ChunkRole {
  if (!docType) return 'lead';
  const roleMap = INTENT_CHUNK_ROLES[intentType];
  if (!roleMap) return 'lead';
  return roleMap[docType] ?? 'lead';
}

/**
 * Flatten RagChunk[] to string[] (content only).
 * Used by the grounding check which operates on plain text evidence,
 * not role-annotated chunks.
 */
export function flattenRagChunks(chunks: RagChunk[]): string[] {
  return chunks.map((c) => c.content);
}
