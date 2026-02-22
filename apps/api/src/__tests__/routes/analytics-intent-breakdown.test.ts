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

describe('analytics.intentBreakdown', () => {
  it('returns topIntents ordered by count DESC and recentIntents', async () => {
    const topIntents = [
      { intent: 'pricing', count: 15, lastSeen: new Date('2026-02-20') },
      { intent: 'greeting', count: 10, lastSeen: new Date('2026-02-21') },
      { intent: 'complaint', count: 3, lastSeen: new Date('2026-02-19') },
    ];
    const recentIntents = [
      { intent: 'greeting', conversationId: 'conv-1', createdAt: new Date('2026-02-21T12:00:00Z') },
      { intent: 'pricing', conversationId: 'conv-2', createdAt: new Date('2026-02-21T11:00:00Z') },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      let selectCount = 0;
      const mockDb = {
        select: () => {
          selectCount++;
          const current = selectCount;
          return {
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: () => current === 1 ? topIntents : recentIntents,
                }),
                orderBy: () => ({
                  limit: () => current === 2 ? recentIntents : [],
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.intentBreakdown();

    expect(result.topIntents).toEqual(topIntents);
    expect(result.topIntents[0].intent).toBe('pricing');
    expect(result.topIntents[0].count).toBe(15);

    expect(result.recentIntents).toEqual(recentIntents);
    expect(result.recentIntents[0].conversationId).toBe('conv-1');
  });

  it('returns empty arrays when no data exists', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      let selectCount = 0;
      const mockDb = {
        select: () => {
          selectCount++;
          const current = selectCount;
          return {
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: () => current === 1 ? [] : [],
                }),
                orderBy: () => ({
                  limit: () => [],
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.intentBreakdown();

    expect(result.topIntents).toEqual([]);
    expect(result.recentIntents).toEqual([]);
  });

  it('limits recentIntents to 10 (via query limit)', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      intent: 'general_inquiry',
      conversationId: `conv-${i}`,
      createdAt: new Date(`2026-02-${String(10 + i).padStart(2, '0')}`),
    }));

    const db = mockTenantDb(async (fn: Any) => {
      let selectCount = 0;
      const mockDb = {
        select: () => {
          selectCount++;
          const current = selectCount;
          return {
            from: () => ({
              where: () => ({
                groupBy: () => ({
                  orderBy: () => current === 1 ? [{ intent: 'general_inquiry', count: 10, lastSeen: new Date() }] : [],
                }),
                orderBy: () => ({
                  limit: () => many,
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.intentBreakdown();

    expect(result.recentIntents.length).toBe(10);
  });
});
