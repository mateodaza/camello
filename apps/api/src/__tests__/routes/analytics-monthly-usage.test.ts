import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { analyticsRouter } from '../../routes/analytics.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(analyticsRouter);

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
// Tests
// ---------------------------------------------------------------------------

describe('analytics.monthlyUsage', () => {
  it('returns resolvedThisMonth and costThisMonth', async () => {
    // Both queries run inside a single tenantDb.query() callback,
    // so the mock db must handle two sequential select() calls.
    const db = mockTenantDb(async (fn: Any) => {
      let selectCount = 0;
      const mockDb = {
        select: () => {
          selectCount++;
          const current = selectCount;
          return {
            from: () => ({
              where: () =>
                current === 1
                  ? [{ count: 42 }]
                  : [{ totalCost: '12.50' }],
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.monthlyUsage();

    expect(result.resolvedThisMonth).toBe(42);
    expect(result.costThisMonth).toBe(12.5);
  });

  it('returns zeros when no data exists', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      let selectCount = 0;
      const mockDb = {
        select: () => {
          selectCount++;
          const current = selectCount;
          return {
            from: () => ({
              where: () =>
                current === 1
                  ? [{ count: 0 }]
                  : [{ totalCost: '0' }],
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.monthlyUsage();

    expect(result.resolvedThisMonth).toBe(0);
    expect(result.costThisMonth).toBe(0);
  });
});
