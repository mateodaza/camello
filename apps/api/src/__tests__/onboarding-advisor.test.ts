import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '../trpc/init.js';
import { onboardingRouter } from '../routes/onboarding.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';

const createOnboardingCaller = createCallerFactory(onboardingRouter);

function mockTenantDb(transactionImpl: (...args: Any[]) => Any): TenantDb {
  // complete() uses ctx.tenantDb.transaction() with all 4 ops on the tx object.
  return { query: transactionImpl, transaction: transactionImpl } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: 'org_test_123',
    userFullName: 'Test Owner',
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// Build a mock tx (Drizzle transaction object) that handles the 4 sequential
// operations complete() performs inside a single ctx.tenantDb.transaction():
//   1. tx.update(tenants)           — set onboardingComplete = true
//   2. tx.select().from(tenants)    — fetch tenant name
//   3. tx.select().from(artifacts)  — check for existing advisor
//   4. tx.insert(artifacts)         — create advisor (conditional)
function makeTxMock({
  tenantName,
  existingAdvisor,
  onInsert,
}: {
  tenantName: string;
  existingAdvisor: { id: string } | null;
  onInsert?: (v: Any) => void;
}) {
  let selectCallCount = 0;

  return {
    // 1. update(tenants) path
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    // 2 & 3. select() — called twice; discriminate by call order
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              // Call 2: fetch tenant name
              return Promise.resolve([{ name: tenantName }]);
            }
            // Call 3: check for existing advisor
            return Promise.resolve(existingAdvisor ? [existingAdvisor] : []);
          },
        }),
      }),
    }),
    // 4. insert(artifacts) — only called when no existing advisor
    insert: () => ({
      values: (v: Any) => {
        onInsert?.(v);
        return Promise.resolve([]);
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onboarding.complete() advisor auto-create (NC-268)', () => {
  it('Test 1: creates advisor artifact when none exists', async () => {
    let capturedInsertValues: Any;

    const txMock = makeTxMock({
      tenantName: 'Test Co',
      existingAdvisor: null, // no advisor yet
      onInsert: (v) => { capturedInsertValues = v; },
    });

    // complete() calls ctx.tenantDb.transaction(callback) once.
    // The mock yields txMock as the tx object to that callback.
    const transactionFn = vi.fn().mockImplementation(async (fn: Any) => fn(txMock));
    const db = mockTenantDb(transactionFn);

    const result = await createOnboardingCaller(makeCtx(db)).complete();

    expect(result).toEqual({ ok: true });
    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(capturedInsertValues).toMatchObject({
      tenantId: TENANT_ID,
      name: 'Test Co Advisor',
      type: 'advisor',
      isActive: true,
    });
  });

  it('Test 2: complete() is idempotent — no duplicate insert when advisor already exists', async () => {
    const insertSpy = vi.fn();

    const txMock = makeTxMock({
      tenantName: 'Test Co',
      existingAdvisor: { id: '00000000-0000-0000-0000-000000000099' }, // already exists
      onInsert: insertSpy,
    });

    const transactionFn = vi.fn().mockImplementation(async (fn: Any) => fn(txMock));
    const db = mockTenantDb(transactionFn);

    const result = await createOnboardingCaller(makeCtx(db)).complete();

    expect(result).toEqual({ ok: true });
    expect(transactionFn).toHaveBeenCalledTimes(1);
    // insert must not be called when advisor already exists
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
