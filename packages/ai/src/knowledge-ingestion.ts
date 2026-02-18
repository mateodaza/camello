import { INGESTION_LIMITS } from '@camello/shared/constants';
import type { PlanTier, KnowledgeChunk } from '@camello/shared/types';
import { chunkText } from './chunker.js';
import { generateEmbeddings } from './embedding.js';

// ---------------------------------------------------------------------------
// Types for dependency injection
// ---------------------------------------------------------------------------

export type InsertChunksFn = (chunks: KnowledgeChunk[]) => Promise<string[]>;

export type GetIngestionCountTodayFn = (tenantId: string) => Promise<number>;

export interface IngestionInput {
  tenantId: string;
  planTier: PlanTier;
  content: string;
  title?: string;
  sourceType: 'upload' | 'url' | 'api';
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  insertChunks: InsertChunksFn;
  getIngestionCountToday: GetIngestionCountTodayFn;
}

export interface IngestionResult {
  chunkCount: number;
  chunkIds: string[];
  title?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class IngestionLimitError extends Error {
  constructor(
    public readonly limit: string,
    public readonly current: number,
    public readonly max: number,
  ) {
    super(`Ingestion limit exceeded: ${limit} (${current}/${max})`);
    this.name = 'IngestionLimitError';
  }
}

// ---------------------------------------------------------------------------
// Main ingestion pipeline
// ---------------------------------------------------------------------------

/**
 * Knowledge ingestion pipeline:
 * 1. Validate plan-tier limits (daily count, content size, chunk count)
 * 2. Chunk the text content
 * 3. Generate embeddings for all chunks in batch
 * 4. Insert chunks via caller-provided callback
 *
 * URL fetching and content extraction happen upstream (Trigger.dev job or API handler).
 * This function receives clean text and handles chunk → embed → insert.
 */
export async function ingestKnowledge(input: IngestionInput): Promise<IngestionResult> {
  const {
    tenantId,
    planTier,
    content,
    title,
    sourceType,
    sourceUrl,
    metadata = {},
    insertChunks,
    getIngestionCountToday,
  } = input;

  const limits = INGESTION_LIMITS[planTier];

  // 1. Check daily ingestion count
  const todayCount = await getIngestionCountToday(tenantId);
  if (todayCount >= limits.max_ingestions_per_day) {
    throw new IngestionLimitError(
      'max_ingestions_per_day',
      todayCount,
      limits.max_ingestions_per_day,
    );
  }

  // 2. Check content size
  const contentBytes = Buffer.byteLength(content, 'utf-8');
  const maxBytes = limits.max_text_size_bytes;
  if (contentBytes > maxBytes) {
    throw new IngestionLimitError('max_content_size', contentBytes, maxBytes);
  }

  // 3. Chunk the text
  const textChunks = chunkText(content);

  // 4. Check chunk count limit
  if (textChunks.length > limits.max_chunks_per_source) {
    throw new IngestionLimitError(
      'max_chunks_per_source',
      textChunks.length,
      limits.max_chunks_per_source,
    );
  }

  // 5. Generate embeddings in batch
  const embeddings = await generateEmbeddings(textChunks);

  // 6. Build chunk objects
  const chunks: KnowledgeChunk[] = textChunks.map((text, i) => ({
    content: text,
    title,
    sourceType,
    chunkIndex: i,
    metadata: {
      ...metadata,
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
      tenant_id: tenantId,
    },
    embedding: embeddings[i],
  }));

  // 7. Insert via caller-provided callback
  const chunkIds = await insertChunks(chunks);

  return {
    chunkCount: chunks.length,
    chunkIds,
    title,
  };
}
