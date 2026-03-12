import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createCallerFactory } from '../../trpc/init.js';
import { conversationRouter } from '../../routes/conversation.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000099';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000010';

const createCaller = createCallerFactory(conversationRouter);

/**
 * Raw row shape — what `limit()` returns from Drizzle.
 * `lastMessage` is a JS object (auto-parsed from PostgreSQL json by pg driver).
 * `at` is a string because row_to_json serializes timestamps as ISO strings.
 */
interface RawPreviewRow {
  id: string;
  artifactId: string;
  customerId: string;
  channel: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  customerName: string;
  customerExternalId: string;
  lastMessage: { preview: string | null; role: string | null; at: string | null } | null;
}

function makePreviewRow(id: string, overrides?: Partial<RawPreviewRow>): RawPreviewRow {
  return {
    id,
    artifactId: ARTIFACT_ID,
    customerId: CUSTOMER_ID,
    channel: 'web_chat',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    customerName: 'Alice',
    customerExternalId: 'ext-1',
    lastMessage: {
      preview: 'Hello, I need help with my order',
      role: 'customer',
      at: '2026-01-02T12:00:00.000Z',
    },
    ...overrides,
  };
}

function makeMockDb(rows: Any[]): { db: TenantDb; whereSpy: ReturnType<typeof vi.fn> } {
  const whereSpy = vi.fn();
  const chain: Any = {
    from: () => chain,
    leftJoin: () => chain,
    where: (...args: Any[]) => { whereSpy(...args); return chain; },
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

describe('conversation.list preview fields', () => {
  it('1 — list returns lastMessagePreview, lastMessageRole, lastMessageAt from mapped lastMessage', async () => {
    const row = makePreviewRow('00000000-0000-0000-0000-000000000011');
    const { db } = makeMockDb([row]);
    const caller = createCaller(makeCtx(db));

    const result = await caller.list({ limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].lastMessagePreview).toBe('Hello, I need help with my order');
    expect(result.items[0].lastMessageRole).toBe('customer');
    // Mapping step converts the ISO string `at` to a Date
    expect(result.items[0].lastMessageAt).toEqual(new Date('2026-01-02T12:00:00.000Z'));
  });
});
