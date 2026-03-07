import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
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

describe('agent.salesSourceBreakdown', () => {
  it('returns grouped counts from the DB', async () => {
    const fakeRows = [
      { channel: 'webchat', count: 10 },
      { channel: 'whatsapp', count: 4 },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: () => fakeRows,
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesSourceBreakdown({ artifactId: ARTIFACT_ID });

    expect(result).toEqual([
      { channel: 'webchat', count: 10 },
      { channel: 'whatsapp', count: 4 },
    ]);
  });

  it('maps null source_channel to "unknown"', async () => {
    const fakeRows = [
      { channel: null, count: 7 },
      { channel: 'webchat', count: 2 },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: () => fakeRows,
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesSourceBreakdown({ artifactId: ARTIFACT_ID });

    expect(result[0]).toEqual({ channel: 'unknown', count: 7 });
    expect(result[1]).toEqual({ channel: 'webchat', count: 2 });
  });
});
