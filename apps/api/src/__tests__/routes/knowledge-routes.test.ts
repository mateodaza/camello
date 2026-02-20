import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  ingestKnowledge: vi.fn(),
  IngestionLimitError: class extends Error {
    limit: string;
    current: number;
    max: number;
    constructor(limit: string, current: number, max: number) {
      super(`Ingestion limit exceeded: ${limit} (${current}/${max})`);
      this.name = 'IngestionLimitError';
      this.limit = limit;
      this.current = current;
      this.max = max;
    }
  },
}));

vi.mock('@camello/ai', () => ({
  ingestKnowledge: mocks.ingestKnowledge,
  IngestionLimitError: mocks.IngestionLimitError,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('knowledge router — queueUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a knowledge_syncs row with status pending', async () => {
    const insertedRow = { id: 'sync-uuid-1', status: 'pending' };
    const db = mockTenantDb(async (cb: Any) => {
      // Simulate Drizzle insert chain returning the row
      const fakeDb = {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => [insertedRow],
            }),
          }),
        }),
      };
      return cb(fakeDb);
    });

    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.queueUrl({ url: 'https://example.com' });

    expect(result).toEqual(insertedRow);
  });

  it('returns already_queued when URL was already inserted', async () => {
    const db = mockTenantDb(async (cb: Any) => {
      // onConflictDoNothing returns empty array when conflict happens
      const fakeDb = {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => [],
            }),
          }),
        }),
      };
      return cb(fakeDb);
    });

    const caller = createCaller(makeCtx({ tenantDb: db }));
    const result = await caller.queueUrl({ url: 'https://example.com' });

    expect(result).toEqual({ id: null, status: 'already_queued' });
  });

  it('rejects invalid URLs', async () => {
    const caller = createCaller(makeCtx());

    await expect(caller.queueUrl({ url: 'not-a-url' })).rejects.toThrow();
  });
});
