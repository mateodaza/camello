import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CONV_ID_1   = '00000000-0000-0000-0000-000000000010';
const CONV_ID_2   = '00000000-0000-0000-0000-000000000011';
const LEAD_ID_1   = '00000000-0000-0000-0000-000000000020';
const USER_ID     = 'user_test_123';

const createCaller = createCallerFactory(agentRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// ---------------------------------------------------------------------------
// agent.exportData
// ---------------------------------------------------------------------------

describe('agent.exportData', () => {
  it('happy path — returns leads, conversations, notes; truncated: false; exportedAt is Date', async () => {
    const convRows = [
      { id: CONV_ID_1, artifactId: ARTIFACT_ID, tenantId: TENANT_ID, createdAt: new Date() },
      { id: CONV_ID_2, artifactId: ARTIFACT_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ];
    const leadRows = [
      { id: LEAD_ID_1, conversationId: CONV_ID_1, tenantId: TENANT_ID, createdAt: new Date() },
    ];
    const noteRows = [
      { id: '00000000-0000-0000-0000-000000000030', leadId: LEAD_ID_1, tenantId: TENANT_ID, createdAt: new Date() },
    ];

    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => {
                  selectCount++;
                  if (selectCount === 1) return Promise.resolve(convRows);
                  if (selectCount === 2) return Promise.resolve(leadRows);
                  return Promise.resolve(noteRows);
                },
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.exportData({ artifactId: ARTIFACT_ID });

    expect(result.conversations).toHaveLength(2);
    expect(result.leads).toHaveLength(1);
    expect(result.notes).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(result.exportedAt).toBeInstanceOf(Date);
  });

  it('empty agent — no conversations → all empty arrays; truncated: false; notes query skipped', async () => {
    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => {
                  selectCount++;
                  return Promise.resolve([]); // empty convRows
                },
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.exportData({ artifactId: ARTIFACT_ID });

    expect(result.conversations).toHaveLength(0);
    expect(result.leads).toHaveLength(0);
    expect(result.notes).toHaveLength(0);
    expect(result.truncated).toBe(false);
    // Only 1 query (for convs) should have run since convs are empty → leads/notes skipped
    expect(selectCount).toBe(1);
  });

  it('truncation on conversations — 1001 rows → truncated: true; conversations sliced to 1000', async () => {
    const manyConvs = Array.from({ length: 1001 }, (_, i) => ({
      id: `conv-${i}`,
      artifactId: ARTIFACT_ID,
      tenantId: TENANT_ID,
      createdAt: new Date(),
    }));

    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => {
                  selectCount++;
                  if (selectCount === 1) return Promise.resolve(manyConvs);
                  // leads query: return empty to avoid note query
                  return Promise.resolve([]);
                },
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.exportData({ artifactId: ARTIFACT_ID });

    expect(result.conversations).toHaveLength(1000);
    expect(result.truncated).toBe(true);
  });

  it('truncation on notes — 1001 note rows → truncated: true; notes sliced to 1000', async () => {
    const convRows = [
      { id: CONV_ID_1, artifactId: ARTIFACT_ID, tenantId: TENANT_ID, createdAt: new Date() },
      { id: CONV_ID_2, artifactId: ARTIFACT_ID, tenantId: TENANT_ID, createdAt: new Date() },
      { id: '00000000-0000-0000-0000-000000000012', artifactId: ARTIFACT_ID, tenantId: TENANT_ID, createdAt: new Date() },
    ];
    const leadRows = [
      { id: LEAD_ID_1, conversationId: CONV_ID_1, tenantId: TENANT_ID, createdAt: new Date() },
      { id: '00000000-0000-0000-0000-000000000021', conversationId: CONV_ID_2, tenantId: TENANT_ID, createdAt: new Date() },
      { id: '00000000-0000-0000-0000-000000000022', conversationId: '00000000-0000-0000-0000-000000000012', tenantId: TENANT_ID, createdAt: new Date() },
    ];
    const manyNotes = Array.from({ length: 1001 }, (_, i) => ({
      id: `note-${i}`,
      leadId: LEAD_ID_1,
      tenantId: TENANT_ID,
      createdAt: new Date(),
    }));

    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => {
                  selectCount++;
                  if (selectCount === 1) return Promise.resolve(convRows);
                  if (selectCount === 2) return Promise.resolve(leadRows);
                  return Promise.resolve(manyNotes);
                },
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.exportData({ artifactId: ARTIFACT_ID });

    expect(result.notes).toHaveLength(1000);
    expect(result.truncated).toBe(true);
    expect(result.leads).toHaveLength(3);
    expect(result.conversations).toHaveLength(3);
  });
});
