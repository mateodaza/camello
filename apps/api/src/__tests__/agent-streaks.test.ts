import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../trpc/init.js';
import { agentRouter } from '../routes/agent.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID     = 'user_test_123';

const createAgentCaller = createCallerFactory(agentRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    userFullName: 'Test Owner',
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Returns [] when artifact has no draft_and_approve modules
// ---------------------------------------------------------------------------

describe('agent.moduleStreaks (NC-229)', () => {
  it('Test 1: returns empty array when artifact has no draft_and_approve modules', async () => {
    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            // artifactModules join — returns empty (no draft_and_approve modules)
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => Promise.resolve([]),
                }),
              }),
            };
          }
          // Should not reach here
          return { from: () => ({ where: () => Promise.resolve([]) }) };
        },
      };
      return fn(mockDb);
    });

    const result = await createAgentCaller(makeCtx(db)).moduleStreaks({
      artifactId: ARTIFACT_ID,
    });

    expect(result).toEqual([]);
    expect(selectCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 2: streak=3 when last 3 executions are 'executed', 4th is 'rejected'
  // -------------------------------------------------------------------------

  it('Test 2: returns streak=3 when last 3 are executed, 4th is rejected', async () => {
    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            // artifactModules — returns one draft_and_approve module
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => Promise.resolve([{ slug: 'send_quote' }]),
                }),
              }),
            };
          }
          // moduleExecutions — 3 executed, then 1 rejected (newest first)
          return {
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => Promise.resolve([
                    { status: 'executed' },
                    { status: 'executed' },
                    { status: 'executed' },
                    { status: 'rejected' },
                  ]),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const result = await createAgentCaller(makeCtx(db)).moduleStreaks({
      artifactId: ARTIFACT_ID,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ moduleSlug: 'send_quote', streak: 3 });
  });

  // -------------------------------------------------------------------------
  // Test 3: streak=0 when most recent execution is 'rejected'
  // -------------------------------------------------------------------------

  it('Test 3: returns streak=0 when most recent execution is rejected', async () => {
    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => Promise.resolve([{ slug: 'book_meeting' }]),
                }),
              }),
            };
          }
          // most recent is rejected
          return {
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => Promise.resolve([
                    { status: 'rejected' },
                    { status: 'executed' },
                    { status: 'executed' },
                  ]),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const result = await createAgentCaller(makeCtx(db)).moduleStreaks({
      artifactId: ARTIFACT_ID,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ moduleSlug: 'book_meeting', streak: 0 });
  });
});
