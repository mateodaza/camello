import { CHUNK_CONFIG } from '@camello/shared/constants';

const {
  target_tokens,
  overlap_tokens,
  chars_per_token,
  min_chunk_chars,
} = CHUNK_CONFIG;

const TARGET_CHARS = target_tokens * chars_per_token;   // ~2048
const OVERLAP_CHARS = overlap_tokens * chars_per_token;  // ~200

/**
 * Split text into chunks suitable for embedding.
 * Strategy: split on paragraph boundaries, merge small paragraphs,
 * split oversized paragraphs on sentence boundaries.
 * Each chunk overlaps with the next by ~50 tokens for context continuity.
 */
export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned || cleaned.length < min_chunk_chars) {
    return cleaned ? [cleaned] : [];
  }

  // Split into paragraphs (double newline or more)
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    // If adding this paragraph stays within target, accumulate
    if (buffer.length + para.length + 2 <= TARGET_CHARS) {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
      continue;
    }

    // Flush current buffer if non-empty
    if (buffer) {
      chunks.push(buffer);
      buffer = keepOverlap(buffer, para.length);
    }

    // If this single paragraph is within target, add to buffer
    if (para.length <= TARGET_CHARS) {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
      continue;
    }

    // Oversized paragraph: split on sentence boundaries
    const sentences = splitSentences(para);
    for (const sentence of sentences) {
      // Hard-split oversized sentences by character boundary
      const parts = sentence.length > TARGET_CHARS
        ? hardSplit(sentence, TARGET_CHARS)
        : [sentence];

      for (const part of parts) {
        if (buffer.length + part.length + 1 <= TARGET_CHARS) {
          buffer = buffer ? `${buffer} ${part}` : part;
        } else {
          if (buffer) {
            chunks.push(buffer);
            buffer = keepOverlap(buffer, part.length);
          }
          buffer = buffer ? `${buffer} ${part}` : part;
        }
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

/** Split text into sentences. Handles common abbreviations. */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space + uppercase
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Keep overlap from previous buffer only if it won't cause the next chunk
 * to exceed TARGET_CHARS when combined with the upcoming content.
 */
function keepOverlap(prevBuffer: string, nextContentLen: number): string {
  const overlapStart = Math.max(0, prevBuffer.length - OVERLAP_CHARS);
  const overlap = prevBuffer.slice(overlapStart);
  // Drop overlap if it + next content would exceed target
  // +2 for worst-case separator (\n\n between paragraphs)
  if (overlap.length + nextContentLen + 2 > TARGET_CHARS) return '';
  return overlap;
}

/** Hard-split text that exceeds maxChars, preferring word boundaries. */
function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    // Try to break at last space within limit
    let splitAt = remaining.lastIndexOf(' ', maxChars);
    if (splitAt <= 0) splitAt = maxChars; // no space found — force split
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

/** Estimate token count from character length. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / chars_per_token);
}
