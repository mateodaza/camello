import { embed, embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
import { RAG_CONFIG } from '@camello/shared/constants';

const model = openai.embedding(RAG_CONFIG.embedding_model, {
  dimensions: RAG_CONFIG.embedding_dimensions,
});

/**
 * Generate a single embedding vector for a text string.
 * Uses OpenAI text-embedding-3-small (1536 dims).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({ model, value: text });
  return embedding;
}

/**
 * Generate embeddings for multiple texts in a single batch call.
 * More efficient than calling generateEmbedding in a loop.
 * OpenAI batches up to 2048 inputs per request.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({ model, values: texts });
  return embeddings;
}
