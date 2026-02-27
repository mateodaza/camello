import { describe, it, expect } from 'vitest';
import {
  classifyChunkRole,
  flattenRagChunks,
  INTENT_CHUNK_ROLES,
} from '../chunk-roles.js';
import type { RagChunk } from '@camello/shared/types';

describe('classifyChunkRole', () => {
  // --- Mapped intents ---

  it('returns "lead" for pricing doc_type on pricing intent', () => {
    expect(classifyChunkRole('pricing', 'pricing')).toBe('lead');
  });

  it('returns "lead" for plans doc_type on pricing intent', () => {
    expect(classifyChunkRole('pricing', 'plans')).toBe('lead');
  });

  it('returns "support" for faq doc_type on pricing intent', () => {
    expect(classifyChunkRole('pricing', 'faq')).toBe('support');
  });

  it('returns "support" for product doc_type on pricing intent', () => {
    expect(classifyChunkRole('pricing', 'product')).toBe('support');
  });

  it('returns "lead" for product doc_type on product_question intent', () => {
    expect(classifyChunkRole('product_question', 'product')).toBe('lead');
  });

  it('returns "lead" for features doc_type on product_question intent', () => {
    expect(classifyChunkRole('product_question', 'features')).toBe('lead');
  });

  it('returns "support" for pricing doc_type on product_question intent', () => {
    expect(classifyChunkRole('product_question', 'pricing')).toBe('support');
  });

  it('returns "lead" for troubleshooting on technical_support intent', () => {
    expect(classifyChunkRole('technical_support', 'troubleshooting')).toBe('lead');
  });

  it('returns "lead" for docs on technical_support intent', () => {
    expect(classifyChunkRole('technical_support', 'docs')).toBe('lead');
  });

  it('returns "support" for faq on technical_support intent', () => {
    expect(classifyChunkRole('technical_support', 'faq')).toBe('support');
  });

  it('returns "lead" for services on booking_request intent', () => {
    expect(classifyChunkRole('booking_request', 'services')).toBe('lead');
  });

  it('returns "lead" for availability on booking_request intent', () => {
    expect(classifyChunkRole('booking_request', 'availability')).toBe('lead');
  });

  it('returns "support" for faq on booking_request intent', () => {
    expect(classifyChunkRole('booking_request', 'faq')).toBe('support');
  });

  it('returns "lead" for troubleshooting on complaint intent', () => {
    expect(classifyChunkRole('complaint', 'troubleshooting')).toBe('lead');
  });

  it('returns "support" for docs on complaint intent', () => {
    expect(classifyChunkRole('complaint', 'docs')).toBe('support');
  });

  it('returns "lead" for faq on general_inquiry intent', () => {
    expect(classifyChunkRole('general_inquiry', 'faq')).toBe('lead');
  });

  // --- Unmapped doc_type within mapped intent ---

  it('defaults to "lead" for unknown doc_type within a mapped intent', () => {
    // "pricing" intent has no entry for "tutorials"
    expect(classifyChunkRole('pricing', 'tutorials')).toBe('lead');
  });

  // --- Unmapped intents ---

  it('returns "lead" for all doc_types on unmapped intents', () => {
    expect(classifyChunkRole('greeting', 'faq')).toBe('lead');
    expect(classifyChunkRole('farewell', 'pricing')).toBe('lead');
    expect(classifyChunkRole('thanks', 'docs')).toBe('lead');
    expect(classifyChunkRole('followup', 'product')).toBe('lead');
    expect(classifyChunkRole('negotiation', 'plans')).toBe('lead');
    expect(classifyChunkRole('escalation_request', 'troubleshooting')).toBe('lead');
    expect(classifyChunkRole('simple_question', 'faq')).toBe('lead');
  });

  // --- Null doc_type ---

  it('returns "lead" when docType is null (no metadata)', () => {
    expect(classifyChunkRole('pricing', null)).toBe('lead');
    expect(classifyChunkRole('product_question', null)).toBe('lead');
    expect(classifyChunkRole('greeting', null)).toBe('lead');
  });

  // --- INTENT_CHUNK_ROLES structure ---

  it('has mappings for the expected intents', () => {
    const mappedIntents = Object.keys(INTENT_CHUNK_ROLES);
    expect(mappedIntents).toContain('pricing');
    expect(mappedIntents).toContain('product_question');
    expect(mappedIntents).toContain('technical_support');
    expect(mappedIntents).toContain('booking_request');
    expect(mappedIntents).toContain('complaint');
    expect(mappedIntents).toContain('general_inquiry');
  });
});

describe('flattenRagChunks', () => {
  it('extracts content from RagChunk array', () => {
    const chunks: RagChunk[] = [
      { content: 'Pricing info', role: 'lead', docType: 'pricing' },
      { content: 'FAQ entry', role: 'support', docType: 'faq' },
    ];
    expect(flattenRagChunks(chunks)).toEqual(['Pricing info', 'FAQ entry']);
  });

  it('returns empty array for empty input', () => {
    expect(flattenRagChunks([])).toEqual([]);
  });

  it('handles chunks with null docType', () => {
    const chunks: RagChunk[] = [
      { content: 'Some content', role: 'lead', docType: null },
    ];
    expect(flattenRagChunks(chunks)).toEqual(['Some content']);
  });

  it('preserves order', () => {
    const chunks: RagChunk[] = [
      { content: 'First', role: 'lead', docType: 'a' },
      { content: 'Second', role: 'support', docType: 'b' },
      { content: 'Third', role: 'lead', docType: 'c' },
    ];
    expect(flattenRagChunks(chunks)).toEqual(['First', 'Second', 'Third']);
  });
});
