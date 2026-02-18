import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens } from '../chunker.js';

// Constants from CHUNK_CONFIG: target=512 tokens, overlap=50 tokens, 4 chars/token, min=100 chars
const TARGET_CHARS = 512 * 4; // 2048
const OVERLAP_CHARS = 50 * 4; // 200

// Helpers
const repeat = (char: string, n: number) => char.repeat(n);
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const text = 'Hello world, this is a short text.';
    // Short but over min_chunk_chars? No — 33 chars < 100 min
    // Actually returned as-is since it's non-empty
    expect(chunkText(text)).toEqual([text]);
  });

  it('returns text below min_chunk_chars as single chunk', () => {
    const text = repeat('a', 99); // below 100 min
    expect(chunkText(text)).toEqual([text]);
  });

  it('merges small paragraphs into single chunk', () => {
    const p1 = repeat('a', 200);
    const p2 = repeat('b', 200);
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(`${p1}\n\n${p2}`);
  });

  it('splits paragraphs that exceed target when combined', () => {
    const p1 = repeat('a', 1500);
    const p2 = repeat('b', 1500);
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  // ---- SIZE INVARIANT: no chunk may exceed TARGET_CHARS ----

  it('no chunk exceeds TARGET_CHARS with two paragraphs near boundary', () => {
    // Regression: 500 + 1847 previously produced a 2049-char chunk
    const p1 = repeat('a', 500);
    const p2 = repeat('b', 1847);
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  it('no chunk exceeds TARGET_CHARS with oversized single paragraph', () => {
    // 5000 chars of lowercase (no sentence boundaries for splitSentences to find)
    const text = repeat('x', 5000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  it('no chunk exceeds TARGET_CHARS with mixed large paragraphs', () => {
    const paragraphs = [
      repeat('a', 2000),
      repeat('b', 2000),
      repeat('c', 2000),
    ];
    const text = paragraphs.join('\n\n');
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  it('no chunk exceeds TARGET_CHARS with oversized sentences', () => {
    // Sentences that are individually larger than TARGET_CHARS
    const longSentence = `${repeat('A', 3000)}. ${repeat('B', 3000)}.`;
    const chunks = chunkText(longSentence);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  // ---- OVERLAP ----

  it('produces overlap between consecutive chunks', () => {
    // Two paragraphs that don't fit together but each fits alone
    const p1 = repeat('a', 1200);
    const p2 = repeat('b', 1200);
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBe(2);
    // Second chunk should start with tail of first (overlap)
    const tail = p1.slice(-OVERLAP_CHARS);
    expect(chunks[1].startsWith(tail)).toBe(true);
  });

  it('drops overlap when it would cause oversized chunk', () => {
    // p2 is nearly TARGET_CHARS — overlap must be dropped
    const p1 = repeat('a', 500);
    const p2 = repeat('b', 2040);
    const text = `${p1}\n\n${p2}`;
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
    // Second chunk should NOT have overlap prefix (would cause overflow)
    expect(chunks[1].startsWith(repeat('a', 10))).toBe(false);
  });

  // ---- SENTENCE SPLITTING ----

  it('splits oversized paragraph on sentence boundaries', () => {
    // Build a paragraph with clear sentence boundaries
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `Sentence number ${i} has some content here.`
    );
    const para = sentences.join(' ');
    // Single paragraph > TARGET_CHARS
    const bigPara = `${para} ${repeat('W', 2000)}`;
    const chunks = chunkText(bigPara);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TARGET_CHARS);
    }
  });

  // ---- CRLF normalization ----

  it('normalizes CRLF to LF', () => {
    const text = `${repeat('a', 200)}\r\n\r\n${repeat('b', 200)}`;
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).not.toContain('\r');
  });

  // ---- Content preservation ----

  it('preserves all content across chunks (no data loss)', () => {
    const p1 = words(100); // ~600 chars
    const p2 = words(100);
    const p3 = words(100);
    const text = `${p1}\n\n${p2}\n\n${p3}`;
    const chunks = chunkText(text);
    // Every word from the original should appear in at least one chunk
    for (const word of ['word0', 'word50', 'word99']) {
      const found = chunks.some(c => c.includes(word));
      expect(found).toBe(true);
    }
  });
});

describe('estimateTokens', () => {
  it('estimates tokens from character count', () => {
    expect(estimateTokens('abcd')).toBe(1); // 4 chars / 4 = 1
    expect(estimateTokens('abcde')).toBe(2); // 5 chars / 4 = 1.25 → ceil = 2
    expect(estimateTokens(repeat('a', 2048))).toBe(512);
  });

  it('returns 0 for empty string', () => {
    // ceil(0/4) = 0
    expect(estimateTokens('')).toBe(0);
  });
});
