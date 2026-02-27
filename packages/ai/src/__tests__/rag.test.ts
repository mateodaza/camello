import { describe, it, expect, vi } from 'vitest';
import { searchKnowledge } from '../rag.js';
import type { Intent, MatchKnowledgeRow } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function makeEmbedFn(): (text: string) => Promise<number[]> {
  return vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);
}

function makeDoc(overrides?: Partial<MatchKnowledgeRow>): MatchKnowledgeRow {
  return {
    id: overrides?.id ?? crypto.randomUUID(),
    content: overrides?.content ?? 'Some knowledge content',
    metadata: overrides?.metadata ?? {},
    embedding: overrides?.embedding ?? [0.1, 0.2, 0.3],
    similarity: overrides?.similarity ?? 0.8,
    fts_rank: overrides?.fts_rank ?? 0.5,
    rrf_score: overrides?.rrf_score ?? 0.7,
    ...overrides,
  };
}

function makeIntent(overrides?: Partial<Intent>): Intent {
  return {
    type: 'pricing',
    confidence: 0.9,
    complexity: 'simple',
    requires_knowledge_base: true,
    sentiment: 'neutral',
    source: 'llm',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('searchKnowledge', () => {
  it('returns RagChunk[] with correct roles for pricing intent', async () => {
    const pricingDoc = makeDoc({
      content: 'Plan costs $99/month',
      metadata: { doc_type: 'pricing' },
      embedding: [0.9, 0.1, 0.0],
    });
    const faqDoc = makeDoc({
      content: 'Frequently asked question',
      metadata: { doc_type: 'faq' },
      embedding: [0.1, 0.9, 0.0],
    });

    const matchKnowledge = vi.fn()
      // Primary search returns both docs
      .mockResolvedValueOnce([pricingDoc, faqDoc])
      // Proactive search returns empty
      .mockResolvedValueOnce([]);

    const result = await searchKnowledge({
      queryText: 'How much does it cost?',
      intent: makeIntent({ type: 'pricing' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    expect(result.searchSkipped).toBe(false);
    expect(result.directContext.length).toBe(2);

    // Pricing doc should be 'lead' for pricing intent
    const pricingChunk = result.directContext.find((c) => c.content === 'Plan costs $99/month');
    expect(pricingChunk).toBeDefined();
    expect(pricingChunk!.role).toBe('lead');
    expect(pricingChunk!.docType).toBe('pricing');

    // FAQ doc should be 'support' for pricing intent
    const faqChunk = result.directContext.find((c) => c.content === 'Frequently asked question');
    expect(faqChunk).toBeDefined();
    expect(faqChunk!.role).toBe('support');
    expect(faqChunk!.docType).toBe('faq');
  });

  it('returns RagChunk[] with correct roles for product_question intent', async () => {
    const productDoc = makeDoc({
      content: 'Product features include X',
      metadata: { doc_type: 'product' },
    });

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce([productDoc])
      .mockResolvedValueOnce([]);

    const result = await searchKnowledge({
      queryText: 'What features do you have?',
      intent: makeIntent({ type: 'product_question' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    expect(result.directContext[0].role).toBe('lead');
    expect(result.directContext[0].docType).toBe('product');
  });

  it('defaults to lead for null doc_type metadata', async () => {
    const doc = makeDoc({
      content: 'Some content',
      metadata: {},  // no doc_type
    });

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce([doc])
      .mockResolvedValueOnce([]);

    const result = await searchKnowledge({
      queryText: 'Tell me about pricing',
      intent: makeIntent({ type: 'pricing' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    expect(result.directContext[0].role).toBe('lead');
    expect(result.directContext[0].docType).toBeNull();
  });

  it('defaults to lead for unmapped intents', async () => {
    const doc = makeDoc({
      content: 'Some content',
      metadata: { doc_type: 'faq' },
    });

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce([doc])
      .mockResolvedValueOnce([]);

    const result = await searchKnowledge({
      queryText: 'Anything else?',
      intent: makeIntent({ type: 'followup' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    // 'followup' has no entry in INTENT_CHUNK_ROLES — all chunks default to lead
    expect(result.directContext[0].role).toBe('lead');
  });

  it('skips search for greeting intent', async () => {
    const matchKnowledge = vi.fn();

    const result = await searchKnowledge({
      queryText: 'Hello!',
      intent: makeIntent({ type: 'greeting', source: 'regex' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    expect(result.searchSkipped).toBe(true);
    expect(result.directContext).toEqual([]);
    expect(result.proactiveContext).toEqual([]);
    expect(matchKnowledge).not.toHaveBeenCalled();
  });

  it('annotates proactive context with chunk roles', async () => {
    const primaryDoc = makeDoc({
      id: 'primary-1',
      content: 'Primary pricing doc',
      metadata: { doc_type: 'pricing' },
    });
    const proactiveDoc = makeDoc({
      id: 'proactive-1',
      content: 'Proactive FAQ',
      metadata: { doc_type: 'faq' },
    });

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce([primaryDoc])
      .mockResolvedValueOnce([proactiveDoc]);

    const result = await searchKnowledge({
      queryText: 'How much?',
      intent: makeIntent({ type: 'pricing' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    expect(result.directContext.length).toBe(1);
    expect(result.directContext[0].role).toBe('lead');

    expect(result.proactiveContext.length).toBe(1);
    expect(result.proactiveContext[0].role).toBe('support');
    expect(result.proactiveContext[0].docType).toBe('faq');
  });

  it('respects token budget for direct context', async () => {
    // Create docs with known content sizes — each doc is ~7 tokens ("word " * 7)
    // TOKEN_BUDGET.rag_context = 2400, so all should fit comfortably
    // Use distinct embeddings so MMR diversity filter doesn't cull duplicates
    const embeddings = [
      [0.9, 0.1, 0.0],
      [0.1, 0.9, 0.0],
      [0.0, 0.1, 0.9],
    ];
    const docs = Array.from({ length: 3 }, (_, i) =>
      makeDoc({
        id: `doc-${i}`,
        content: `Document ${i} with some content here`,
        metadata: { doc_type: 'pricing' },
        embedding: embeddings[i],
      }),
    );

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce(docs)
      .mockResolvedValueOnce([]);

    const result = await searchKnowledge({
      queryText: 'pricing',
      intent: makeIntent({ type: 'pricing' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    expect(result.directContext.length).toBe(3);
    expect(result.totalTokensUsed).toBeGreaterThan(0);
  });

  it('returns RagChunk shape with all required fields', async () => {
    const doc = makeDoc({
      content: 'Test content',
      metadata: { doc_type: 'docs' },
    });

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce([doc])
      .mockResolvedValueOnce([]);

    const result = await searchKnowledge({
      queryText: 'help me',
      intent: makeIntent({ type: 'technical_support' }),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    const chunk = result.directContext[0];
    expect(chunk).toHaveProperty('content');
    expect(chunk).toHaveProperty('role');
    expect(chunk).toHaveProperty('docType');
    expect(typeof chunk.content).toBe('string');
    expect(['lead', 'support']).toContain(chunk.role);
  });
});
