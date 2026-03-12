import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createCallerFactory } from '../../trpc/init.js';
import { conversationRouter } from '../../routes/conversation.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000099';

const createCaller = createCallerFactory(conversationRouter);

const dialect = new PgDialect();
function getWhereSql(sqlNode: Any): string {
  return dialect.sqlToQuery(sqlNode as Any).sql;
}
function getWhereParams(sqlNode: Any): unknown[] {
  return dialect.sqlToQuery(sqlNode as Any).params;
}

function makeRow(id: string, isSandbox: boolean | null = false) {
  return {
    id,
    artifactId: '00000000-0000-0000-0000-000000000010',
    customerId: CUSTOMER_ID,
    channel: 'web_chat',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    customerName: 'Alice',
    customerExternalId: 'ext-1',
    isSandbox,
    lastMessage: null,
  };
}

function makeMockDb(rows: Any[]): { db: TenantDb; whereSpy: ReturnType<typeof vi.fn> } {
  const whereSpy = vi.fn();
  const chain: Any = {
    from: () => chain,
    leftJoin: () => chain,
    where: (...args: Any[]) => {
      whereSpy(...args);
      return chain;
    },
    orderBy: () => chain,
    limit: async () => rows,
  };
  const rawDb = { select: () => chain };
  const db: TenantDb = {
    query: async (fn: Any) => fn(rawDb),
    transaction: async (fn: Any) => fn(rawDb),
  } as Any;
  return { db, whereSpy };
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

describe('conversation.list sandbox filter', () => {
  it('1 — showSandbox: true → no sandbox exclusion in WHERE', async () => {
    const { db, whereSpy } = makeMockDb([makeRow('00000000-0000-0000-0000-000000000011')]);
    const caller = createCaller(makeCtx(db));

    await caller.list({ showSandbox: true, limit: 10 });

    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    // Only tenantId — no sandbox condition added
    expect(params).toContain(TENANT_ID);
    expect(params).toHaveLength(1);
    // SQL text must not mention sandbox
    const sql = getWhereSql(whereSpy.mock.calls[0][0]);
    expect(sql).not.toContain('sandbox');
  });

  it('2 — showSandbox: false → sandbox exclusion IS in WHERE', async () => {
    const { db, whereSpy } = makeMockDb([makeRow('00000000-0000-0000-0000-000000000021')]);
    const caller = createCaller(makeCtx(db));

    await caller.list({ showSandbox: false, limit: 10 });

    expect(whereSpy).toHaveBeenCalledOnce();
    // SQL text must include the sandbox jsonb fragment
    const sql = getWhereSql(whereSpy.mock.calls[0][0]);
    expect(sql).toContain('sandbox');
  });

  it('3 — isSandbox: true in row maps to true in returned item', async () => {
    const { db } = makeMockDb([makeRow('00000000-0000-0000-0000-000000000031', true)]);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ limit: 10 });

    expect(result.items[0].isSandbox).toBe(true);
  });

  it('4 — isSandbox: null in row maps to false in returned item', async () => {
    const { db } = makeMockDb([makeRow('00000000-0000-0000-0000-000000000041', null)]);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ limit: 10 });

    expect(result.items[0].isSandbox).toBe(false);
  });
});
