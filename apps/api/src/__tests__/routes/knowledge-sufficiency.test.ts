import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

vi.mock('@camello/ai', () => ({
  ingestKnowledge: vi.fn(),
  IngestionLimitError: class extends Error {},
}));

vi.mock('@camello/shared/constants', () => ({
  INGESTION_LIMITS: {
    starter: { max_ingestions_per_day: 10, max_text_size_bytes: 50000, max_chunks_per_source: 50 },
  },
}));

vi.mock('@camello/db', () => ({
  knowledgeDocs: {
    id: 'knowledge_docs.id',
    tenantId: 'knowledge_docs.tenant_id',
    title: 'knowledge_docs.title',
    content: 'knowledge_docs.content',
    sourceType: 'knowledge_docs.source_type',
    chunkIndex: 'knowledge_docs.chunk_index',
    metadata: 'knowledge_docs.metadata',
    embedding: 'knowledge_docs.embedding',
    createdAt: 'knowledge_docs.created_at',
  },
  knowledgeSyncs: {
    id: 'knowledge_syncs.id',
    tenantId: 'knowledge_syncs.tenant_id',
    sourceUrl: 'knowledge_syncs.source_url',
    sourceType: 'knowledge_syncs.source_type',
    status: 'knowledge_syncs.status',
  },
  tenants: {
    id: 'tenants.id',
    planTier: 'tenants.plan_tier',
  },
  ownerNotifications: {
    id: 'owner_notifications.id',
    tenantId: 'owner_notifications.tenant_id',
    type: 'owner_notifications.type',
    createdAt: 'owner_notifications.created_at',
  },
}));

import { createCallerFactory } from '../../trpc/init.js';
import { knowledgeRouter } from '../../routes/knowledge.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const ORG_ID = 'org_test_123';

const createCaller = createCallerFactory(knowledgeRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(overrides: Partial<{ tenantDb: TenantDb }> = {}) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    tenantDb: overrides.tenantDb ?? mockTenantDb(async () => []),
  };
}

/**
 * Helper: creates a mockTenantDb whose select chain returns different counts
 * for each sequential query call (docs → syncs → gaps).
 */
function mockDbForScore(docCount: number, syncedCount: number, gapCount: number): TenantDb {
  let call = 0;
  return mockTenantDb(async (cb: Any) => {
    const fakeDb = {
      select: (_fields: Any) => ({
        from: (_table: Any) => ({
          where: (_cond: Any) => {
            call++;
            if (call === 1) return [{ count: docCount }];    // knowledgeDocs
            if (call === 2) return [{ count: syncedCount }]; // knowledgeSyncs
            return [{ count: gapCount }];                    // ownerNotifications (knowledge_gap)
          },
        }),
      }),
    };
    return cb(fakeDb);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('knowledge.sufficiencyScore', () => {
  it('1 — score is 0 when no docs exist', async () => {
    const db = mockDbForScore(0, 0, 8);
    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.sufficiencyScore();

    expect(result.score).toBe(0);
    expect(result.signals).toContain('No product information added yet');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('2 — score increases with docs and triggers few-docs signal', async () => {
    const db = mockDbForScore(2, 0, 0);
    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.sufficiencyScore();

    expect(result.score).toBe(40);
    expect(result.signals).toContain('Only 2 knowledge doc(s) added — add more to reach the full score');
  });

  it('3 — gap penalty applied correctly, no-website signal fires', async () => {
    const db = mockDbForScore(4, 0, 5);
    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.sufficiencyScore();

    expect(result.score).toBe(55);
    expect(result.signals).toContain("5 questions your agent couldn't answer in the last 30 days");
    expect(result.signals).toContain('No website connected');
  });

  it('4 — max score with all factors present, signals empty', async () => {
    const db = mockDbForScore(5, 1, 0);
    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.sufficiencyScore();

    expect(result.score).toBe(100);
    expect(result.signals).toHaveLength(0);
  });

  it('6 — gap query failure degrades gracefully: score computed without penalty, gapCount=0', async () => {
    // Simulate the ownerNotifications query throwing (e.g., table missing or permission error).
    // The implementation catches this and defaults gapCount to 0, so score should be unpenalized.
    let call = 0;
    const db = mockTenantDb(async (cb: Any) => {
      const fakeDb = {
        select: (_fields: Any) => ({
          from: (_table: Any) => ({
            where: (_cond: Any) => {
              call++;
              if (call === 1) return [{ count: 4 }];   // knowledgeDocs
              if (call === 2) return [{ count: 1 }];   // knowledgeSyncs (has synced URL)
              throw new Error('ownerNotifications unavailable'); // gap query fails
            },
          }),
        }),
      };
      return cb(fakeDb);
    });
    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.sufficiencyScore();

    // With 4 docs + synced URL + 0 gap penalty (failure defaulted) = 100
    expect(result.score).toBe(100);
    expect(result.gapCount).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it('5 — signals never empty when score < 60 (docCount=1, synced URL, no gaps)', async () => {
    const db = mockDbForScore(1, 1, 0);
    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.sufficiencyScore();

    expect(result.score).toBe(40);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals).toContain('Only 1 knowledge doc(s) added — add more to reach the full score');
  });
});
