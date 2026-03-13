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

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onboarding.complete() advisor auto-create (NC-268)', () => {
  it('Test 1: creates advisor artifact when none exists', async () => {
    let capturedInsertValues: Any;

    const queryFn = vi.fn()
      // Call 1: settings update (onboardingComplete = true)
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
        };
        return fn(mockDb);
      })
      // Call 2: select tenant name
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ name: 'Test Co' }]),
              }),
            }),
          }),
        };
        return fn(mockDb);
      })
      // Call 3: check for existing advisor — none found
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        };
        return fn(mockDb);
      })
      // Call 4: insert new advisor
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          insert: () => ({
            values: (v: Any) => {
              capturedInsertValues = v;
              return Promise.resolve([]);
            },
          }),
        };
        return fn(mockDb);
      });

    const db = mockTenantDb(queryFn);
    const result = await createOnboardingCaller(makeCtx(db)).complete();

    expect(result).toEqual({ ok: true });
    expect(queryFn).toHaveBeenCalledTimes(4);
    expect(capturedInsertValues).toMatchObject({
      tenantId: TENANT_ID,
      name: 'Test Co Advisor',
      type: 'advisor',
      isActive: true,
    });
  });

  it('Test 2: complete() is idempotent — no duplicate insert when advisor already exists', async () => {
    const insertFn = vi.fn();

    const queryFn = vi.fn()
      // Call 1: settings update
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
        };
        return fn(mockDb);
      })
      // Call 2: select tenant name
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ name: 'Test Co' }]),
              }),
            }),
          }),
        };
        return fn(mockDb);
      })
      // Call 3: check for existing advisor — found!
      .mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ id: '00000000-0000-0000-0000-000000000099' }]),
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

    const db = mockTenantDb(queryFn);
    const result = await createOnboardingCaller(makeCtx(db)).complete();

    expect(result).toEqual({ ok: true });
    // Only 3 calls — no insert (call 4)
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(insertFn).not.toHaveBeenCalled();
  });
});
