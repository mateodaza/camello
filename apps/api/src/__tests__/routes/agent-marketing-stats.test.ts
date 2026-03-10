import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID     = 'user_test_123';

const createCaller = createCallerFactory(agentRouter);

function mockTenantDb(executeResult: { rows: Any[] }): TenantDb {
  return {
    query: async (fn: Any) => fn({ execute: async () => executeResult }),
    transaction: async (fn: Any) => fn({ execute: async () => executeResult }),
  } as Any;
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

describe('agent.marketingStats', () => {
  it('happy path — returns totalInterests, topCategories, draftCount', async () => {
    const db = mockTenantDb({
      rows: [
        {
          total_interests: 5,
          top_categories: [
            { topic: 'Product A', count: 3 },
            { topic: 'Product B', count: 2 },
          ],
          draft_count: 2,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.marketingStats({ artifactId: ARTIFACT_ID });

    expect(result.totalInterests).toBe(5);
    expect(result.topCategories).toHaveLength(2);
    expect(result.topCategories[0]).toEqual({ topic: 'Product A', count: 3 });
    expect(result.draftCount).toBe(2);
  });

  it('zero state — null top_categories coerced to empty array', async () => {
    const db = mockTenantDb({
      rows: [
        {
          total_interests: 0,
          top_categories: null,
          draft_count: 0,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.marketingStats({ artifactId: ARTIFACT_ID });

    expect(result.totalInterests).toBe(0);
    expect(result.topCategories).toEqual([]);
    expect(result.draftCount).toBe(0);
  });

  it('top categories capped at 3 — mapping preserves all 3 entries', async () => {
    const db = mockTenantDb({
      rows: [
        {
          total_interests: 10,
          top_categories: [
            { topic: 'A', count: 5 },
            { topic: 'B', count: 3 },
            { topic: 'C', count: 2 },
          ],
          draft_count: 1,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.marketingStats({ artifactId: ARTIFACT_ID });

    expect(result.topCategories).toHaveLength(3);
    expect(result.topCategories[0].topic).toBe('A');
    expect(result.topCategories[2].topic).toBe('C');
  });

  it('draft count excludes reviewed — draft_status IS NULL filter handled by backend', async () => {
    const db = mockTenantDb({
      rows: [
        {
          total_interests: 3,
          top_categories: [{ topic: 'Widget', count: 3 }],
          draft_count: 0,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.marketingStats({ artifactId: ARTIFACT_ID });

    expect(result.draftCount).toBe(0);
  });
});
