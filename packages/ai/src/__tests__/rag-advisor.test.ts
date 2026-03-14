import { describe, it, expect, vi } from 'vitest';
import { searchKnowledge } from '../rag.js';
import type { Intent, MatchKnowledgeRow } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Helpers (mirrors rag.test.ts helpers)
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

describe('searchKnowledge — advisor-source doc retrieval', () => {
  it('5a — advisor-source doc appears in proactive context', async () => {
    const advisorDoc = makeDoc({
      content: 'Owner confirmed: 50 products, holiday peak',
      metadata: { source_type: 'advisor' },
      embedding: [0.5, 0.5, 0.0],
    });

    const matchKnowledge = vi.fn()
      // Primary search: no direct results (advisor doc not in narrow doc-type scope)
      .mockResolvedValueOnce([])
      // Proactive search (docTypes: null, broader scope): returns the advisor doc
      .mockResolvedValueOnce([advisorDoc]);

    const result = await searchKnowledge({
      queryText: 'What did the owner say about their products?',
      intent: makeIntent(),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    const proactiveIds = (result.proactiveContext ?? []).map((c) => c.content);
    expect(proactiveIds.some((c) => c.includes('50 products'))).toBe(true);
  });

  it('5b — proactive matchKnowledge call uses docTypes: null (broad scope enables advisor-source retrieval)', async () => {
    const advisorDoc = makeDoc({
      content: 'Owner said: sell handmade furniture',
      metadata: { source_type: 'advisor' },
      embedding: [0.5, 0.5, 0.0],
    });

    const matchKnowledge = vi.fn()
      .mockResolvedValueOnce([])           // primary
      .mockResolvedValueOnce([advisorDoc]); // proactive

    await searchKnowledge({
      queryText: 'What products do we sell?',
      intent: makeIntent(),
      tenantId: TENANT_ID,
      embed: makeEmbedFn(),
      matchKnowledge,
    });

    // matchKnowledge called exactly twice: primary + proactive
    expect(matchKnowledge).toHaveBeenCalledTimes(2);

    // Second call (proactive) must use docTypes: null to enable all source types including 'advisor'
    const secondCallArgs = matchKnowledge.mock.calls[1][0];
    expect(secondCallArgs.docTypes).toBeNull();
  });
});
