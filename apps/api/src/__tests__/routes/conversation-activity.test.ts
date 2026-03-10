import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { conversationRouter } from '../../routes/conversation.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID  = '00000000-0000-0000-0000-000000000001';
const CONV_ID    = '00000000-0000-0000-0000-000000000011';
const LEAD_ID    = '00000000-0000-0000-0000-000000000010';
const USER_ID    = 'user_test_123';

const createCaller = createCallerFactory(conversationRouter);

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
// conversation.activity
// ---------------------------------------------------------------------------

describe('conversation.activity', () => {
  it('1 — happy path: mixed types are merged and sorted ASC by timestamp', async () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const tsExec        = new Date(base.getTime() + 10_000); // T+10s
    const tsStageChange = new Date(base.getTime() +  5_000); // T+5s  (earlier)

    const executionRow = {
      moduleSlug: 'send_quote',
      moduleName: 'Send Quote',
      input: { amount: 100 },
      output: { sent: true },
      createdAt: tsExec,
    };
    const leadRow        = { id: LEAD_ID };
    const stageChangeRow = {
      fromStage: 'new',
      toStage: 'qualifying',
      createdAt: tsStageChange,
    };

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // executions: .from().leftJoin().where().orderBy()
            return { from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => [executionRow] }) }) }) };
          }
          if (callIndex === 2) {
            // leads: .from().where().limit()
            return { from: () => ({ where: () => ({ limit: () => [leadRow] }) }) };
          }
          // stage changes: .from().where().orderBy()
          return { from: () => ({ where: () => ({ orderBy: () => [stageChangeRow] }) }) };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.activity({ conversationId: CONV_ID });

    expect(result).toHaveLength(2);
    // stage_change has earlier timestamp → index 0
    expect(result[0].type).toBe('stage_change');
    expect(result[0].timestamp).toEqual(tsStageChange);
    // execution has later timestamp → index 1
    expect(result[1].type).toBe('execution');
    expect(result[1].timestamp).toEqual(tsExec);
  });

  it('2 — empty: no executions and no lead returns []', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // executions query returns empty
            return { from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => [] }) }) }) };
          }
          // leads query returns empty → no stage-changes query issued
          return { from: () => ({ where: () => ({ limit: () => [] }) }) };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.activity({ conversationId: CONV_ID });

    expect(result).toEqual([]);
  });

  it('3 — executions only: lead exists but no stage changes', async () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const execRows = [
      { moduleSlug: 'qualify_lead', moduleName: 'Qualify Lead', input: {}, output: null, createdAt: new Date(base.getTime() + 1_000) },
      { moduleSlug: 'book_meeting',  moduleName: 'Book Meeting',  input: {}, output: null, createdAt: new Date(base.getTime() + 2_000) },
    ];
    const leadRow = { id: LEAD_ID };

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return { from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => execRows }) }) }) };
          }
          if (callIndex === 2) {
            return { from: () => ({ where: () => ({ limit: () => [leadRow] }) }) };
          }
          // stage changes → empty
          return { from: () => ({ where: () => ({ orderBy: () => [] }) }) };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.activity({ conversationId: CONV_ID });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === 'execution')).toBe(true);
  });

  it('4 — stage changes only: no executions, lead has 2 stage changes', async () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const leadRow = { id: LEAD_ID };
    const stageRows = [
      { fromStage: 'new',        toStage: 'qualifying', createdAt: new Date(base.getTime() + 1_000) },
      { fromStage: 'qualifying', toStage: 'proposal',   createdAt: new Date(base.getTime() + 2_000) },
    ];

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // executions → empty
            return { from: () => ({ leftJoin: () => ({ where: () => ({ orderBy: () => [] }) }) }) };
          }
          if (callIndex === 2) {
            // leads → 1 row
            return { from: () => ({ where: () => ({ limit: () => [leadRow] }) }) };
          }
          // stage changes → 2 rows
          return { from: () => ({ where: () => ({ orderBy: () => stageRows }) }) };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.activity({ conversationId: CONV_ID });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === 'stage_change')).toBe(true);
    expect(result[0].fromStage).toBe('new');
    expect(result[0].toStage).toBe('qualifying');
    expect(result[1].fromStage).toBe('qualifying');
    expect(result[1].toStage).toBe('proposal');
  });
});
