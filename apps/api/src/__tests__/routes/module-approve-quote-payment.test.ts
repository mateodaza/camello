import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { moduleRouter } from '../../routes/module.js';
import type { TenantDb } from '@camello/db';

vi.mock('@camello/ai', () => ({
  getModule: vi.fn(),
  processRejection: vi.fn(),
  generateEmbedding: vi.fn(),
}));

import { getModule } from '@camello/ai';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const MODULE_ID = '00000000-0000-0000-0000-000000000003';
const EXECUTION_ID = '00000000-0000-0000-0000-000000000004';
const CONV_ID = '00000000-0000-0000-0000-000000000005';
const LEAD_ID = '00000000-0000-0000-0000-000000000006';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000007';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(moduleRouter);

function mockTenantDb(queryFn: (...args: Any[]) => Any): TenantDb {
  return { query: queryFn, transaction: queryFn } as Any;
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

const FAKE_EXECUTION = {
  id: EXECUTION_ID,
  moduleId: MODULE_ID,
  artifactId: ARTIFACT_ID,
  conversationId: CONV_ID,
  tenantId: TENANT_ID,
  status: 'approved',
  input: { customer_id: CUSTOMER_ID },
};

const SEND_QUOTE_OUTPUT = {
  quote_id: 'QT-0001',
  total: '1500.00',
  currency: 'USD',
  message: 'Here is your quote',
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1: send_quote approval → payment inserted
// ---------------------------------------------------------------------------

describe('module.approve — send_quote', () => {
  it('inserts a pending payment row when send_quote is approved', async () => {
    vi.mocked(getModule).mockReturnValue({ execute: async () => SEND_QUOTE_OUTPUT } as Any);

    let callIdx = 0;
    let capturedPaymentValues: Any = null;

    const queryFn = vi.fn(async (fn: Any) => {
      callIdx++;
      switch (callIdx) {
        case 1:
          // Atomic UPDATE → approved
          return fn({
            update: () => ({ set: () => ({ where: () => ({ returning: () => [FAKE_EXECUTION] }) }) }),
          });
        case 2:
          // SELECT slug FROM modules
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ slug: 'send_quote' }] }) }) }),
          });
        case 3:
          // UPDATE moduleExecutions status='executed'
          return fn({
            update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
          });
        case 4:
          // SELECT lead WHERE conversationId
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ id: LEAD_ID, customerId: CUSTOMER_ID }] }) }) }),
          });
        case 5:
          // INSERT INTO payments
          return fn({
            insert: () => ({
              values: (vals: Any) => {
                capturedPaymentValues = vals;
                return Promise.resolve(undefined);
              },
            }),
          });
        default:
          throw new Error(`Unexpected query call #${callIdx}`);
      }
    });

    const caller = createCaller(makeCtx(mockTenantDb(queryFn)));
    const result = await caller.approve({ executionId: EXECUTION_ID });

    expect(result?.status).toBe('executed');
    expect(queryFn).toHaveBeenCalledTimes(5);
    expect(capturedPaymentValues).toMatchObject({
      tenantId: TENANT_ID,
      artifactId: ARTIFACT_ID,
      conversationId: CONV_ID,
      quoteExecutionId: EXECUTION_ID,
      leadId: LEAD_ID,
      customerId: CUSTOMER_ID,
      amount: '1500.00',
      currency: 'USD',
      status: 'pending',
      description: 'Quote QT-0001',
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2: non-send_quote approval → payment NOT inserted
// ---------------------------------------------------------------------------

describe('module.approve — non-send_quote slug', () => {
  it('does NOT insert a payment when slug is book_meeting', async () => {
    vi.mocked(getModule).mockReturnValue({ execute: async () => ({ confirmation: 'booked' }) } as Any);

    let callIdx = 0;

    const queryFn = vi.fn(async (fn: Any) => {
      callIdx++;
      switch (callIdx) {
        case 1:
          return fn({
            update: () => ({ set: () => ({ where: () => ({ returning: () => [FAKE_EXECUTION] }) }) }),
          });
        case 2:
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ slug: 'book_meeting' }] }) }) }),
          });
        case 3:
          return fn({
            update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
          });
        default:
          throw new Error(`Unexpected query call #${callIdx}`);
      }
    });

    const caller = createCaller(makeCtx(mockTenantDb(queryFn)));
    const result = await caller.approve({ executionId: EXECUTION_ID });

    expect(result?.status).toBe('executed');
    expect(queryFn).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Test 3: send_quote approval, no lead → payment skipped
// ---------------------------------------------------------------------------

describe('module.approve — send_quote with no lead', () => {
  it('skips payment insert when no lead exists for the conversation', async () => {
    vi.mocked(getModule).mockReturnValue({ execute: async () => SEND_QUOTE_OUTPUT } as Any);

    let callIdx = 0;

    const queryFn = vi.fn(async (fn: Any) => {
      callIdx++;
      switch (callIdx) {
        case 1:
          return fn({
            update: () => ({ set: () => ({ where: () => ({ returning: () => [FAKE_EXECUTION] }) }) }),
          });
        case 2:
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ slug: 'send_quote' }] }) }) }),
          });
        case 3:
          return fn({
            update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
          });
        case 4:
          // No lead found
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
          });
        default:
          throw new Error(`Unexpected query call #${callIdx}`);
      }
    });

    const caller = createCaller(makeCtx(mockTenantDb(queryFn)));
    const result = await caller.approve({ executionId: EXECUTION_ID });

    expect(result?.status).toBe('executed');
    expect(queryFn).toHaveBeenCalledTimes(4);
  });
});
