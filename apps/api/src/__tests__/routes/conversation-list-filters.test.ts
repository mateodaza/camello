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

/**
 * Converts a Drizzle SQL node (the argument passed to `.where()`) into the
 * list of bound parameter values that would be sent to the database driver.
 * Uses PgDialect — the same serializer Drizzle uses internally — so we are
 * checking the ACTUAL SQL that would be produced, not a mock representation.
 */
const dialect = new PgDialect();
function getWhereParams(sqlNode: Any): unknown[] {
  return dialect.sqlToQuery(sqlNode as Any).params;
}

function makeRow(id: string) {
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
    summary: null,
  };
}

/**
 * Builds a mock TenantDb. The `.where()` method is a vi.fn() spy so tests can
 * inspect the Drizzle SQL condition that was passed to it — proving the filter
 * was actually appended to the WHERE clause, not just accepted by Zod.
 */
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

describe('conversation.list filters', () => {
  it('1 — happy path: no filters returns items and nextCursor null', async () => {
    const rows = [
      makeRow('00000000-0000-0000-0000-000000000011'),
      makeRow('00000000-0000-0000-0000-000000000012'),
    ];
    const { db, whereSpy } = makeMockDb(rows);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
    // Baseline WHERE clause has exactly 1 bound param: the tenantId
    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    expect(params).toContain(TENANT_ID);
    expect(params).toHaveLength(1);
  });

  it('2 — pagination: nextCursor set when mock returns limit+1 rows', async () => {
    const rows = [
      makeRow('00000000-0000-0000-0000-000000000021'),
      makeRow('00000000-0000-0000-0000-000000000022'),
      makeRow('00000000-0000-0000-0000-000000000023'),
    ];
    const { db } = makeMockDb(rows);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ limit: 2 });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe(rows[1].id);
  });

  it('3 — status filter: WHERE clause includes status value', async () => {
    const rows = [makeRow('00000000-0000-0000-0000-000000000031')];
    const { db, whereSpy } = makeMockDb(rows);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ status: 'active', limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    // 'active' must be a bound param — proves eq(conversations.status, 'active') was added
    expect(params).toContain('active');
    // Total: tenantId + 'active' = 2 params
    expect(params).toHaveLength(2);
  });

  it('4 — channel filter: WHERE clause includes channel value', async () => {
    const rows = [makeRow('00000000-0000-0000-0000-000000000041')];
    const { db, whereSpy } = makeMockDb(rows);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ channel: 'web_chat', limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    // 'web_chat' must be a bound param — proves eq(conversations.channel, 'web_chat') was added
    expect(params).toContain('web_chat');
    expect(params).toHaveLength(2);
  });

  it('5 — dateRange=7d: WHERE clause includes a date cutoff param', async () => {
    const { db, whereSpy } = makeMockDb([]);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ dateRange: '7d', limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    // The cutoff Date is pushed directly into the sql() template queryChunks as a
    // raw value — Drizzle's fallback path returns it as-is in the params array.
    const dateParam = params.find((v) => v instanceof Date);
    expect(dateParam).toBeDefined();
    expect(dateParam).toBeInstanceOf(Date);
    // Total: tenantId + cutoff_date = 2 params
    expect(params).toHaveLength(2);
  });

  it('6 — search filter: WHERE clause includes ILIKE pattern', async () => {
    const rows = [makeRow('00000000-0000-0000-0000-000000000061')];
    const { db, whereSpy } = makeMockDb(rows);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ search: 'Alice', limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    // '%Alice%' must appear twice: once for customerName ILIKE, once for messages EXISTS
    const pattern = '%Alice%';
    expect(params.filter((v) => v === pattern)).toHaveLength(2);
    // Total: tenantId + '%Alice%' + '%Alice%' = 3 params
    expect(params).toHaveLength(3);
  });

  it('7 — customerId filter: WHERE clause includes customerId value', async () => {
    const rows = [
      makeRow('00000000-0000-0000-0000-000000000071'),
      makeRow('00000000-0000-0000-0000-000000000072'),
    ];
    const { db, whereSpy } = makeMockDb(rows);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ customerId: CUSTOMER_ID, limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    // CUSTOMER_ID UUID must be a bound param — proves eq(conversations.customerId, ...) was added
    expect(params).toContain(CUSTOMER_ID);
    expect(params).toHaveLength(2);
  });
});
