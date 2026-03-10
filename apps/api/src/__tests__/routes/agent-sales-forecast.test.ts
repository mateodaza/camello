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

describe('agent.salesForecast', () => {
  it('happy path — all historical (>= 5 terminated each stage)', async () => {
    const db = mockTenantDb({
      rows: [
        { stage: 'qualifying',  lead_count: 10, total_value: '10000', won_count: 6, terminated_count: 10 },
        { stage: 'proposal',    lead_count: 5,  total_value: '20000', won_count: 3, terminated_count: 5  },
        { stage: 'negotiation', lead_count: 3,  total_value: '5000',  won_count: 4, terminated_count: 5  },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesForecast({ artifactId: ARTIFACT_ID });

    const qualifying  = result.stages.find((s) => s.stage === 'qualifying')!;
    const proposal    = result.stages.find((s) => s.stage === 'proposal')!;
    const negotiation = result.stages.find((s) => s.stage === 'negotiation')!;

    expect(qualifying.conversionRate).toBeCloseTo(0.60);
    expect(qualifying.forecastValue).toBeCloseTo(6000);
    expect(qualifying.isFallback).toBe(false);

    expect(proposal.conversionRate).toBeCloseTo(0.60);
    expect(proposal.forecastValue).toBeCloseTo(12000);
    expect(proposal.isFallback).toBe(false);

    expect(negotiation.conversionRate).toBeCloseTo(0.80);
    expect(negotiation.forecastValue).toBeCloseTo(4000);
    expect(negotiation.isFallback).toBe(false);

    expect(result.totalForecast).toBeCloseTo(22000);
  });

  it('partial fallback — one stage < 5 terminated', async () => {
    const db = mockTenantDb({
      rows: [
        { stage: 'qualifying', lead_count: 8, total_value: '15000', won_count: 2, terminated_count: 4 },
        { stage: 'proposal',   lead_count: 6, total_value: '30000', won_count: 3, terminated_count: 6 },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesForecast({ artifactId: ARTIFACT_ID });

    const qualifying = result.stages.find((s) => s.stage === 'qualifying')!;
    const proposal   = result.stages.find((s) => s.stage === 'proposal')!;

    expect(qualifying.isFallback).toBe(true);
    expect(qualifying.conversionRate).toBeCloseTo(0.20);
    expect(qualifying.forecastValue).toBeCloseTo(3000);

    expect(proposal.isFallback).toBe(false);
    expect(proposal.conversionRate).toBeCloseTo(0.50);
    expect(proposal.forecastValue).toBeCloseTo(15000);

    expect(result.totalForecast).toBeCloseTo(18000);
  });

  it('all fallback — no history (terminated_count = 0)', async () => {
    const db = mockTenantDb({
      rows: [
        { stage: 'qualifying',  lead_count: 4, total_value: '5000', won_count: 0, terminated_count: 0 },
        { stage: 'negotiation', lead_count: 2, total_value: '8000', won_count: 0, terminated_count: 0 },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesForecast({ artifactId: ARTIFACT_ID });

    const qualifying  = result.stages.find((s) => s.stage === 'qualifying')!;
    const negotiation = result.stages.find((s) => s.stage === 'negotiation')!;

    expect(qualifying.isFallback).toBe(true);
    expect(qualifying.conversionRate).toBeCloseTo(0.20);
    expect(qualifying.forecastValue).toBeCloseTo(1000);

    expect(negotiation.isFallback).toBe(true);
    expect(negotiation.conversionRate).toBeCloseTo(0.70);
    expect(negotiation.forecastValue).toBeCloseTo(5600);

    expect(result.totalForecast).toBeCloseTo(6600);
  });

  it('empty pipeline — no active leads', async () => {
    const db = mockTenantDb({ rows: [] });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesForecast({ artifactId: ARTIFACT_ID });

    expect(result.totalForecast).toBe(0);
    expect(result.stages).toHaveLength(0);
  });
});
