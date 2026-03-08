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

describe('agent.salesComparison', () => {
  it('happy path — both weeks have data', async () => {
    const db = mockTenantDb({
      rows: [{
        this_new_leads: 5,
        last_new_leads: 3,
        this_won_deals: 2,
        last_won_deals: 1,
        this_revenue: '1000',
        last_revenue: '500',
        this_conversations: 8,
        last_conversations: 6,
      }],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesComparison({ artifactId: ARTIFACT_ID });

    expect(result.thisWeek.newLeads).toBe(5);
    expect(result.lastWeek.newLeads).toBe(3);
    expect(result.deltas.newLeads).toBe(67); // round((5-3)/3*100)
    expect(result.deltas.wonDeals).toBe(100); // (2-1)/1*100
    expect(result.deltas.totalRevenue).toBe(100); // (1000-500)/500*100
    expect(result.deltas.conversations).toBe(33); // round((8-6)/6*100)
  });

  it('last week = 0, this week has data — deltas are null', async () => {
    const db = mockTenantDb({
      rows: [{
        this_new_leads: 3,
        last_new_leads: 0,
        this_won_deals: 0,
        last_won_deals: 0,
        this_revenue: '0',
        last_revenue: '0',
        this_conversations: 2,
        last_conversations: 0,
      }],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesComparison({ artifactId: ARTIFACT_ID });

    expect(result.thisWeek.newLeads).toBe(3);
    expect(result.deltas.newLeads).toBeNull();
    expect(result.deltas.conversations).toBeNull();
    expect(result.deltas.wonDeals).toBeNull();
    expect(result.deltas.totalRevenue).toBeNull();
  });

  it('both weeks = 0 (empty rows fallback) — all zeros, all deltas null', async () => {
    const db = mockTenantDb({ rows: [] });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesComparison({ artifactId: ARTIFACT_ID });

    expect(result.thisWeek.newLeads).toBe(0);
    expect(result.thisWeek.wonDeals).toBe(0);
    expect(result.thisWeek.totalRevenue).toBe(0);
    expect(result.thisWeek.conversations).toBe(0);
    expect(result.lastWeek.newLeads).toBe(0);
    expect(result.deltas.newLeads).toBeNull();
    expect(result.deltas.wonDeals).toBeNull();
    expect(result.deltas.totalRevenue).toBeNull();
    expect(result.deltas.conversations).toBeNull();
  });

  it('partial — mixed zero/nonzero last week values', async () => {
    const db = mockTenantDb({
      rows: [{
        this_new_leads: 4,
        last_new_leads: 2,
        this_won_deals: 1,
        last_won_deals: 0,
        this_revenue: '0',
        last_revenue: '0',
        this_conversations: 5,
        last_conversations: 4,
      }],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesComparison({ artifactId: ARTIFACT_ID });

    expect(result.deltas.newLeads).toBe(100); // (4-2)/2*100
    expect(result.deltas.wonDeals).toBeNull(); // last=0
    expect(result.deltas.totalRevenue).toBeNull(); // last=0
    expect(result.deltas.conversations).toBe(25); // (5-4)/4*100
  });
});
