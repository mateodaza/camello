import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LEAD_ID   = '00000000-0000-0000-0000-000000000010';
const CONV_ID   = '00000000-0000-0000-0000-000000000011';
const USER_ID   = 'user_test_123';

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
// agent.leadNotes
// ---------------------------------------------------------------------------

describe('agent.leadNotes', () => {
  it('returns notes for a lead in createdAt ASC order', async () => {
    const fakeLead = { id: LEAD_ID };
    const fakeNotes = [
      { id: 'n1', leadId: LEAD_ID, author: 'owner', content: 'First note', createdAt: new Date('2026-01-01') },
      { id: 'n2', leadId: LEAD_ID, author: 'system', content: 'Second note', createdAt: new Date('2026-01-02') },
    ];

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // Lead guard: .select().from().where().limit()
            return { from: () => ({ where: () => ({ limit: () => [fakeLead] }) }) };
          }
          // Notes query: .select().from().where().orderBy()
          return { from: () => ({ where: () => ({ orderBy: () => fakeNotes }) }) };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.leadNotes({ leadId: LEAD_ID });

    expect(result).toHaveLength(2);
    expect(result[0].author).toBe('owner');
    expect(result[1].author).toBe('system');
  });

  it('throws NOT_FOUND when lead does not exist for tenant', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({ where: () => ({ limit: () => [] }) }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(caller.leadNotes({ leadId: LEAD_ID })).rejects.toThrow('Lead not found');
  });
});

// ---------------------------------------------------------------------------
// agent.addLeadNote
// ---------------------------------------------------------------------------

describe('agent.addLeadNote', () => {
  it('inserts note with author=owner and returns inserted row', async () => {
    const fakeLead = { id: LEAD_ID };
    const fakeNote = { id: 'n1', tenantId: TENANT_ID, leadId: LEAD_ID, author: 'owner', content: 'Test note', createdAt: new Date() };

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          // Lead guard
          return { from: () => ({ where: () => ({ limit: () => [fakeLead] }) }) };
        },
        insert: () => ({
          values: () => ({
            returning: () => [fakeNote],
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.addLeadNote({ leadId: LEAD_ID, content: 'Test note' });

    expect(result.author).toBe('owner');
    expect(result.content).toBe('Test note');
    expect(result.leadId).toBe(LEAD_ID);
  });

  it('throws NOT_FOUND when lead does not exist for tenant', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({ where: () => ({ limit: () => [] }) }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(caller.addLeadNote({ leadId: LEAD_ID, content: 'Test' })).rejects.toThrow('Lead not found');
  });

  it('throws BAD_REQUEST (Zod) when content exceeds 500 chars', async () => {
    const db = mockTenantDb(async (fn: Any) => fn({}));
    const caller = createCaller(makeCtx(db));
    const longContent = 'x'.repeat(501);
    await expect(caller.addLeadNote({ leadId: LEAD_ID, content: longContent })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// agent.salesLeadDetail — extended return (Test 6)
// ---------------------------------------------------------------------------

describe('agent.salesLeadDetail', () => {
  it('returns notes, messages, and stageChanges alongside interactions and executions', async () => {
    const leadRow = {
      id: LEAD_ID,
      score: 'hot',
      stage: 'proposal',
      estimatedValue: '5000.00',
      budget: null,
      timeline: null,
      summary: null,
      tags: [],
      closeReason: null,
      qualifiedAt: new Date(),
      convertedAt: null,
      customerId: 'c1',
      customerName: 'Alice',
      customerEmail: 'alice@test.com',
      customerPhone: null,
      conversationId: CONV_ID,
    };
    const fakeAttr = { totalMessages: 5, totalInteractions: 3, totalCost: '0.01' };
    const fakeInteractions = [{ intent: 'qualify', costUsd: '0.001', latencyMs: 200, createdAt: new Date() }];
    const fakeExecutions  = [{ moduleSlug: 'send_quote', status: 'executed', createdAt: new Date() }];
    const fakeNotes        = [{ id: 'n1', author: 'owner', content: 'Good lead', createdAt: new Date() }];
    const fakeMessages     = [{ id: 'm1', role: 'customer', content: 'Hello', createdAt: new Date() }];
    const fakeStageChanges = [{ id: 'sc1', fromStage: 'new', toStage: 'proposal', createdAt: new Date() }];

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // leadRow: .from().innerJoin().where().limit()
            return { from: () => ({ innerJoin: () => ({ where: () => ({ limit: () => [leadRow] }) }) }) };
          }
          if (callIndex === 2) {
            // attribution: .from().leftJoin().leftJoin().where()
            return { from: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => [fakeAttr] }) }) }) };
          }
          if (callIndex === 3) {
            // recentInteractions: .from().where().orderBy().limit()
            return { from: () => ({ where: () => ({ orderBy: () => ({ limit: () => fakeInteractions }) }) }) };
          }
          if (callIndex === 4) {
            // recentExecutions: .from().where().orderBy().limit()
            return { from: () => ({ where: () => ({ orderBy: () => ({ limit: () => fakeExecutions }) }) }) };
          }
          if (callIndex === 5) {
            // notes: .from().where().orderBy().limit()
            return { from: () => ({ where: () => ({ orderBy: () => ({ limit: () => fakeNotes }) }) }) };
          }
          if (callIndex === 6) {
            // messages: .from().where().orderBy().limit()
            return { from: () => ({ where: () => ({ orderBy: () => ({ limit: () => fakeMessages }) }) }) };
          }
          if (callIndex === 7) {
            // stageChanges: .from().where().orderBy()
            return { from: () => ({ where: () => ({ orderBy: () => fakeStageChanges }) }) };
          }
          // conversationMeta: .from().where().limit().then()
          return { from: () => ({ where: () => ({ limit: () => ({ then: (fn: (rows: unknown[]) => unknown) => fn([{ summary: null, resolvedAt: null }]) }) }) }) };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesLeadDetail({ leadId: LEAD_ID });

    expect(result.interactions).toHaveLength(1);
    expect(result.executions).toHaveLength(1);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].author).toBe('owner');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('customer');
    expect(result.stageChanges).toHaveLength(1);
    expect(result.stageChanges[0].fromStage).toBe('new');
    expect(result.stageChanges[0].toStage).toBe('proposal');
  });
});
