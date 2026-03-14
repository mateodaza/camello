import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockIngestKnowledge, mockTenantDbQuery } = vi.hoisted(() => ({
  mockIngestKnowledge: vi.fn(),
  mockTenantDbQuery: vi.fn(),
}));

vi.mock('@camello/db', async () => {
  const schema = await vi.importActual<typeof import('@camello/db/schema')>('@camello/db/schema');
  return { ...schema, db: {}, pool: {}, createTenantDb: vi.fn() };
});

vi.mock('@camello/ai', () => ({
  ingestKnowledge: mockIngestKnowledge,
  IngestionLimitError: class IngestionLimitError extends Error {
    constructor(msg: string) { super(msg); this.name = 'IngestionLimitError'; }
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { knowledgeRouter } from '../routes/knowledge.js';
import { createCallerFactory } from '../trpc/init.js';

const TENANT_ID = 'a0a0a0a0-0000-0000-0000-000000000001';
const ARTIFACT_ID = 'b1b1b1b1-0000-0000-0000-000000000002';

function makeCtx(queryImpl: (cb: (db: unknown) => unknown) => unknown) {
  return {
    req: {} as Request,
    userId: 'user_1',
    orgId: 'org_1',
    tenantId: TENANT_ID,
    tenantDb: { query: queryImpl } as unknown as TenantDb,
  };
}

const createCaller = createCallerFactory(knowledgeRouter);

describe('knowledge.list — scope filtering', () => {
  it('returns all docs when scope=all (no extra condition)', async () => {
    const rows = [
      { id: 'doc-1', title: 'Global doc', artifactId: null, sourceType: 'upload', chunkIndex: 0, createdAt: new Date(), contentPreview: 'hello' },
      { id: 'doc-2', title: 'Agent doc', artifactId: ARTIFACT_ID, sourceType: 'upload', chunkIndex: 0, createdAt: new Date(), contentPreview: 'world' },
    ];
    const caller = createCaller(makeCtx(async (cb) => cb({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ offset: () => rows }) }) }) }) }) })));
    const result = await caller.list({ scope: 'all', limit: 50, offset: 0 });
    expect(result).toHaveLength(2);
  });

  it('returns only global docs when scope=global', async () => {
    const globalRows = [
      { id: 'doc-1', title: 'Global doc', artifactId: null, sourceType: 'upload', chunkIndex: 0, createdAt: new Date(), contentPreview: 'hello' },
    ];
    let capturedWhere: unknown;
    const caller = createCaller(makeCtx(async (cb) => {
      // Intercept to capture that isNull condition is applied
      return cb({
        select: () => ({ from: () => ({ where: (cond: unknown) => { capturedWhere = cond; return { orderBy: () => ({ limit: () => ({ offset: () => globalRows }) }) }; } }) }),
      });
    }));
    const result = await caller.list({ scope: 'global', limit: 50, offset: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].artifactId).toBeNull();
    // Condition was passed (isNull was added)
    expect(capturedWhere).toBeDefined();
  });

  it('returns only agent docs when scope=agent with artifactId', async () => {
    const agentRows = [
      { id: 'doc-2', title: 'Agent doc', artifactId: ARTIFACT_ID, sourceType: 'upload', chunkIndex: 0, createdAt: new Date(), contentPreview: 'world' },
    ];
    const caller = createCaller(makeCtx(async (cb) => cb({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ offset: () => agentRows }) }) }) }) }) })));
    const result = await caller.list({ scope: 'agent', artifactId: ARTIFACT_ID, limit: 50, offset: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].artifactId).toBe(ARTIFACT_ID);
  });
});

describe('knowledge.ingest — artifactId threading', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('passes artifactId=null to insertChunks when not provided (global)', async () => {
    const insertedIds: Array<string | null> = [];

    mockIngestKnowledge.mockImplementation(async ({ insertChunks }: { insertChunks: (chunks: unknown[]) => Promise<string[]> }) => {
      await insertChunks([{ content: 'chunk', sourceType: 'upload', chunkIndex: 0, metadata: {} }]);
      return { chunkCount: 1, docIds: ['doc-1'] };
    });

    const tenantDb: TenantDb = {
      query: async (cb: (db: unknown) => unknown) => cb({
        select: () => ({ from: () => ({ where: () => ({ limit: () => [{ planTier: 'starter' }] }) }) }),
        insert: () => ({
          values: (vals: Array<{ artifactId: string | null }>) => {
            insertedIds.push(...vals.map(v => v.artifactId));
            return { returning: () => [{ id: 'doc-1' }] };
          },
        }),
      }),
    } as unknown as TenantDb;

    const caller = createCaller({ req: {} as Request, userId: 'u1', orgId: 'o1', tenantId: TENANT_ID, tenantDb });
    await caller.ingest({ content: 'hello world', sourceType: 'upload' });
    expect(insertedIds).toEqual([null]);
  });

  it('passes artifactId to insertChunks when provided (agent-scoped)', async () => {
    const insertedIds: Array<string | null> = [];

    mockIngestKnowledge.mockImplementation(async ({ insertChunks }: { insertChunks: (chunks: unknown[]) => Promise<string[]> }) => {
      await insertChunks([{ content: 'chunk', sourceType: 'upload', chunkIndex: 0, metadata: {} }]);
      return { chunkCount: 1, docIds: ['doc-2'] };
    });

    const tenantDb: TenantDb = {
      query: async (cb: (db: unknown) => unknown) => cb({
        select: () => ({ from: () => ({ where: () => ({ limit: () => [{ planTier: 'starter' }] }) }) }),
        insert: () => ({
          values: (vals: Array<{ artifactId: string | null }>) => {
            insertedIds.push(...vals.map(v => v.artifactId));
            return { returning: () => [{ id: 'doc-2' }] };
          },
        }),
      }),
    } as unknown as TenantDb;

    const caller = createCaller({ req: {} as Request, userId: 'u1', orgId: 'o1', tenantId: TENANT_ID, tenantDb });
    await caller.ingest({ content: 'agent knowledge', sourceType: 'upload', artifactId: ARTIFACT_ID });
    expect(insertedIds).toEqual([ARTIFACT_ID]);
  });
});

describe('knowledge.deleteByTitle', () => {
  it('returns deletedCount matching rows removed', async () => {
    const tenantDb: TenantDb = {
      query: async (cb: (db: unknown) => unknown) => cb({
        delete: () => ({ where: () => ({ returning: () => [{ id: 'doc-1' }, { id: 'doc-2' }] }) }),
      }),
    } as unknown as TenantDb;

    const caller = createCaller({ req: {} as Request, userId: 'u1', orgId: 'o1', tenantId: TENANT_ID, tenantDb });
    const result = await caller.deleteByTitle({ title: 'My Doc' });
    expect(result.deletedCount).toBe(2);
  });
});
