import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../trpc/init.js';
import { agentRouter } from '../routes/agent.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID  = '00000000-0000-0000-0000-000000000001';
const PAYMENT_ID = '00000000-0000-0000-0000-000000000020';
const USER_ID    = 'user_test_123';

const createAgentCaller = createCallerFactory(agentRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    userFullName: 'Test Owner',
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agent.markPaymentPaid (NC-262)', () => {
  it('Test 1: sets status to paid and returns updated payment', async () => {
    // New implementation: conditional UPDATE first (returns row on success), no preflight SELECT.
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () =>
                Promise.resolve([{ id: PAYMENT_ID, status: 'paid', paidAt: new Date() }]),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const result = await createAgentCaller(makeCtx(db)).markPaymentPaid({
      paymentId: PAYMENT_ID,
    });

    expect(result).toBeDefined();
    expect(result!.status).toBe('paid');
    expect(result!.paidAt).toBeInstanceOf(Date);
  });

  it('Test 2: throws PRECONDITION_FAILED when payment is already paid', async () => {
    // Conditional UPDATE returns 0 rows (status was already 'paid').
    // Discriminating SELECT finds the row → PRECONDITION_FAILED.
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([]), // 0 rows — condition not met
            }),
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([{ id: PAYMENT_ID }]), // row exists → already paid
          }),
        }),
      };
      return fn(mockDb);
    });

    await expect(
      createAgentCaller(makeCtx(db)).markPaymentPaid({ paymentId: PAYMENT_ID }),
    ).rejects.toThrow(TRPCError);

    await expect(
      createAgentCaller(makeCtx(db)).markPaymentPaid({ paymentId: PAYMENT_ID }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('Test 3: throws NOT_FOUND when payment does not exist (or belongs to a different tenant)', async () => {
    // Conditional UPDATE returns 0 rows, discriminating SELECT also returns 0 rows → NOT_FOUND.
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => Promise.resolve([]), // 0 rows — condition not met
            }),
          }),
        }),
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]), // row not found → different tenant or doesn't exist
          }),
        }),
      };
      return fn(mockDb);
    });

    await expect(
      createAgentCaller(makeCtx(db)).markPaymentPaid({ paymentId: PAYMENT_ID }),
    ).rejects.toThrow(TRPCError);

    await expect(
      createAgentCaller(makeCtx(db)).markPaymentPaid({ paymentId: PAYMENT_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
