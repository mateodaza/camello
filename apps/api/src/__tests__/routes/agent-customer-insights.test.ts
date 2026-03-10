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

// NOTE: The HAVING COUNT(conv.id) > 1 threshold is enforced at the SQL layer.
// Unit tests mock the raw execute() result and therefore always pass rows with
// conversation_count >= 2 — rows with count = 1 would never be returned by the DB.

describe('agent.customerInsights', () => {
  it('happy path — sorted by conv count, last topic populated', async () => {
    const db = mockTenantDb({
      rows: [
        {
          id: 'uuid-1',
          name: 'Carlos',
          email: 'carlos@example.com',
          conversation_count: 5,
          last_seen_at: '2026-03-07T10:00:00.000Z',
          last_topic: 'pricing',
        },
        {
          id: 'uuid-2',
          name: null,
          email: 'anon@example.com',
          conversation_count: 2,
          last_seen_at: '2026-03-06T10:00:00.000Z',
          last_topic: null,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.customerInsights({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0]!.conversationCount).toBe(5);
    expect(result[0]!.lastTopic).toBe('pricing');
    expect(result[1]!.conversationCount).toBe(2);
  });

  it('empty result — no returning customers', async () => {
    const db = mockTenantDb({ rows: [] });

    const caller = createCaller(makeCtx(db));
    const result = await caller.customerInsights({ artifactId: ARTIFACT_ID });

    expect(result).toEqual([]);
  });

  it('customer with no past_topic fact — lastTopic is null', async () => {
    const db = mockTenantDb({
      rows: [
        {
          id: 'uuid-3',
          name: 'Maria',
          email: 'maria@example.com',
          conversation_count: 3,
          last_seen_at: '2026-03-05T09:00:00.000Z',
          last_topic: null,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.customerInsights({ artifactId: ARTIFACT_ID });

    expect(result[0]!.lastTopic).toBeNull();
  });

  it('lastSeenAt is coerced to Date', async () => {
    const db = mockTenantDb({
      rows: [
        {
          id: 'uuid-4',
          name: 'Test',
          email: 'test@example.com',
          conversation_count: 4,
          last_seen_at: '2026-03-07T10:00:00.000Z',
          last_topic: null,
        },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.customerInsights({ artifactId: ARTIFACT_ID });

    expect(result[0]!.lastSeenAt).toBeInstanceOf(Date);
    expect(result[0]!.lastSeenAt).toEqual(new Date('2026-03-07T10:00:00.000Z'));
  });
});
