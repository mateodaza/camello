import {
  NO_SEARCH_INTENTS,
  INTENT_TO_DOC_TYPES,
  RAG_CONFIG,
  TOKEN_BUDGET,
} from '@camello/shared/constants';
import type { ArtifactType, Intent, MatchKnowledgeRow, RagChunk, RagResult } from '@camello/shared/types';
import { estimateTokens } from './chunker.js';
import { classifyChunkRole } from './chunk-roles.js';
import { getArchetype } from './archetype-registry.js';

// ---------------------------------------------------------------------------
// Types for dependency injection (no @camello/db import needed)
// ---------------------------------------------------------------------------

interface MatchKnowledgeParams {
  queryEmbedding: number[];
  queryText: string;
  tenantId: string;
  docTypes: string[] | null;
  similarityThreshold: number;
  matchCount: number;
}

/**
 * Callback that executes the match_knowledge SQL function.
 * The API layer provides this by calling the SQL function via TenantDb.
 */
export type MatchKnowledgeFn = (params: MatchKnowledgeParams) => Promise<MatchKnowledgeRow[]>;

export type EmbedFn = (text: string) => Promise<number[]>;

export interface RagSearchInput {
  queryText: string;
  intent: Intent;
  tenantId: string;
  embed: EmbedFn;
  matchKnowledge: MatchKnowledgeFn;
  archetypeType?: ArtifactType;
}

// ---------------------------------------------------------------------------
// Main RAG search orchestrator
// ---------------------------------------------------------------------------

/**
 * Full RAG search pipeline:
 * 1. Gate — skip search for greeting/farewell/thanks
 * 2. Generate query embedding
 * 3. Primary search — high relevance, intent-scoped doc types
 * 4. Proactive cross-referencing — lower threshold, broader scope
 * 5. MMR diversification — reduce redundancy
 * 6. Context assembly — fit within token budget
 */
export async function searchKnowledge(input: RagSearchInput): Promise<RagResult> {
  const { queryText, intent, tenantId, embed, matchKnowledge } = input;

  // 1. Gate: skip for intents that don't need knowledge
  if (shouldSkipSearch(intent)) {
    return { directContext: [], proactiveContext: [], totalTokensUsed: 0, docsRetrieved: 0, searchSkipped: true };
  }

  // 2. Generate embedding for the query
  const queryEmbedding = await embed(queryText);

  // 3. Primary search: high relevance, narrow doc types
  const docTypes = INTENT_TO_DOC_TYPES[intent.type] ?? null;
  const primaryResults = await matchKnowledge({
    queryEmbedding,
    queryText,
    tenantId,
    docTypes,
    similarityThreshold: RAG_CONFIG.primary.similarity_threshold,
    matchCount: RAG_CONFIG.primary.match_count,
  });

  // 4. Proactive search: lower threshold, all doc types, fewer results
  const proactiveResults = await matchKnowledge({
    queryEmbedding,
    queryText,
    tenantId,
    docTypes: null, // broader scope
    similarityThreshold: RAG_CONFIG.proactive.similarity_threshold,
    matchCount: RAG_CONFIG.proactive.match_count,
  });

  // Deduplicate: remove proactive results already in primary
  const primaryIds = new Set(primaryResults.map(r => r.id));
  const uniqueProactive = proactiveResults.filter(r => !primaryIds.has(r.id));

  // 5. Normalize embeddings (pgvector may return strings) and filter nulls
  const embeddedPrimary = normalizeResults(primaryResults);
  const embeddedProactive = normalizeResults(uniqueProactive);

  // 5b. Archetype RAG bias: boost scores for doc types matching the archetype
  if (input.archetypeType) {
    const archetype = getArchetype(input.archetypeType);
    if (archetype?.ragBias) {
      applyArchetypeBias(embeddedPrimary, archetype.ragBias.docTypes, archetype.ragBias.boost);
      applyArchetypeBias(embeddedProactive, archetype.ragBias.docTypes, archetype.ragBias.boost);
    }
  }

  // 6. MMR diversification on primary results
  const diversePrimary = applyMMR(embeddedPrimary);

  // 7. Context assembly within token budget (intent-aware chunk roles)
  return assembleContext(diversePrimary, embeddedProactive, intent.type);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize results from match_knowledge: parse string embeddings (pgvector
 * returns "[1,2,3]" strings via raw pg) and filter out docs with no embedding.
 */
function normalizeResults(docs: MatchKnowledgeRow[]): MatchKnowledgeRow[] {
  const out: MatchKnowledgeRow[] = [];
  for (const doc of docs) {
    const embedding = parseEmbedding(doc.embedding);
    if (embedding.length > 0) {
      out.push({ ...doc, embedding });
    }
  }
  return out;
}

function parseEmbedding(raw: unknown): number[] {
  if (Array.isArray(raw) && raw.length > 0) return raw;
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Archetype bias
// ---------------------------------------------------------------------------

/** Boost rrf_score for docs whose doc_type matches the archetype's preferred types. */
function applyArchetypeBias(docs: MatchKnowledgeRow[], biasDocTypes: string[], boost: number): void {
  const biasSet = new Set(biasDocTypes);
  for (const doc of docs) {
    const docType = (doc.metadata?.doc_type as string) ?? '';
    if (biasSet.has(docType)) {
      doc.rrf_score += boost;
    }
  }
  // Re-sort by boosted rrf_score (descending) so MMR seeds with the best candidate
  docs.sort((a, b) => b.rrf_score - a.rrf_score);
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

function shouldSkipSearch(intent: Intent): boolean {
  return (NO_SEARCH_INTENTS as readonly string[]).includes(intent.type);
}

// ---------------------------------------------------------------------------
// MMR (Maximal Marginal Relevance)
// ---------------------------------------------------------------------------

/**
 * Maximal Marginal Relevance: iteratively select docs that are
 * both relevant (high rrf_score) and diverse (low similarity to already-selected).
 *
 * MMR(d) = λ * relevance(d) - (1-λ) * max_sim(d, selected)
 */
function applyMMR(docs: MatchKnowledgeRow[]): MatchKnowledgeRow[] {
  if (docs.length <= 1) return docs;

  const { lambda, diversity_threshold } = RAG_CONFIG.mmr;
  const selected: MatchKnowledgeRow[] = [];
  const remaining = [...docs];

  // Seed with the highest-scoring doc
  selected.push(remaining.shift()!);

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.rrf_score;

      // Max cosine similarity to any already-selected doc
      const maxSim = Math.max(
        ...selected.map(s => cosineSimilarity(candidate.embedding, s.embedding)),
      );

      // Skip if too similar to existing selection
      if (maxSim > diversity_threshold) continue;

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // all remaining too similar
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  return selected;
}

/** Cosine similarity between two vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

/**
 * Assemble RAG context chunks that fit within the token budget.
 * Each chunk is annotated with its role (lead/support) based on the current
 * intent and the document's doc_type metadata.
 *
 * Direct context fills the full budget first. Proactive context uses
 * remaining budget (capped at max_tokens). No artificial reservation.
 */
function assembleContext(
  primary: MatchKnowledgeRow[],
  proactive: MatchKnowledgeRow[],
  intentType: string,
): RagResult {
  const maxTokens = TOKEN_BUDGET.rag_context;
  const maxProactiveTokens = RAG_CONFIG.proactive.max_tokens;
  const maxProactiveDocs = RAG_CONFIG.proactive.max_docs;

  const directContext: RagChunk[] = [];
  let directTokensUsed = 0;

  // Fill direct context up to full budget
  for (const doc of primary) {
    const docTokens = estimateTokens(doc.content);
    if (directTokensUsed + docTokens > maxTokens) break;
    const docType = (doc.metadata?.doc_type as string) ?? null;
    directContext.push({
      content: doc.content,
      role: classifyChunkRole(intentType, docType),
      docType,
    });
    directTokensUsed += docTokens;
  }

  // Proactive context uses remaining budget, capped at max_tokens
  const proactiveContext: RagChunk[] = [];
  const remainingBudget = maxTokens - directTokensUsed;
  const proactiveBudget = Math.min(maxProactiveTokens, remainingBudget);

  let proactiveTokensUsed = 0;
  for (const doc of proactive.slice(0, maxProactiveDocs)) {
    const docTokens = estimateTokens(doc.content);
    if (proactiveTokensUsed + docTokens > proactiveBudget) break;
    const docType = (doc.metadata?.doc_type as string) ?? null;
    proactiveContext.push({
      content: doc.content,
      role: classifyChunkRole(intentType, docType),
      docType,
    });
    proactiveTokensUsed += docTokens;
  }

  return {
    directContext,
    proactiveContext,
    totalTokensUsed: directTokensUsed + proactiveTokensUsed,
    docsRetrieved: directContext.length + proactiveContext.length,
    searchSkipped: false,
  };
}
