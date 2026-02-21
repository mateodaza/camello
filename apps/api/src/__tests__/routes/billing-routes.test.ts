import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  paddleSubscriptionsUpdate: vi.fn(),
  paddleSubscriptionsCancel: vi.fn(),
  paddleTransactionsCreate: vi.fn(),
  tierToPriceId: vi.fn(),
}));

vi.mock('../../lib/paddle.js', () => ({
  getPaddle: () => ({
    subscriptions: {
      update: mocks.paddleSubscriptionsUpdate,
      cancel: mocks.paddleSubscriptionsCancel,
    },
    transactions: {
      create: mocks.paddleTransactionsCreate,
    },
  }),
  tierToPriceId: mocks.tierToPriceId,
}));

import { createCallerFactory } from '../../trpc/init.js';
import { billingRouter } from '../../routes/billing.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(billingRouter);

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

function tenantRow(overrides: Record<string, Any> = {}) {
  return {
    planTier: 'starter',
    subscriptionStatus: 'none',
    paddleSubscriptionId: null,
    paddleCustomerId: null,
    monthlyCostBudgetUsd: '5',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('billing router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tierToPriceId.mockImplementation((tier: string) => `pri_${tier}`);
  });

  describe('currentPlan', () => {
    it('returns plan info with limits and price', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [tenantRow({ planTier: 'growth', subscriptionStatus: 'active' })],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.currentPlan();

      expect(result.planTier).toBe('growth');
      expect(result.subscriptionStatus).toBe('active');
      expect(result.limits).toMatchObject({ artifacts: 3, modules: 10 });
      expect(result.price).toMatchObject({ monthly: 249, label: 'Growth' });
    });

    it('throws NOT_FOUND when tenant does not exist', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      await expect(caller.currentPlan()).rejects.toThrow('Tenant not found');
    });
  });

  describe('createCheckout', () => {
    it('creates a new checkout when no active subscription', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [tenantRow()],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      mocks.paddleTransactionsCreate.mockResolvedValue({
        id: 'txn_test_123',
        checkout: { url: 'https://checkout.paddle.com/test' },
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.createCheckout({ planTier: 'growth' });

      expect(result).toEqual({
        updated: false,
        transactionId: 'txn_test_123',
      });
      expect(mocks.paddleTransactionsCreate).toHaveBeenCalledWith({
        items: [{ priceId: 'pri_growth', quantity: 1 }],
        customData: { tenantId: TENANT_ID },
        collectionMode: 'automatic',
      });
    });

    it('updates subscription in-place when active sub exists', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [tenantRow({
                  planTier: 'starter',
                  subscriptionStatus: 'active',
                  paddleSubscriptionId: 'sub_existing_789',
                })],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      mocks.paddleSubscriptionsUpdate.mockResolvedValue({});

      const caller = createCaller(makeCtx(db));
      const result = await caller.createCheckout({ planTier: 'growth' });

      expect(result).toEqual({ updated: true, transactionId: null });
      expect(mocks.paddleSubscriptionsUpdate).toHaveBeenCalledWith('sub_existing_789', {
        items: [{ priceId: 'pri_growth', quantity: 1 }],
        prorationBillingMode: 'prorated_immediately',
      });
      expect(mocks.paddleTransactionsCreate).not.toHaveBeenCalled();
    });

    it('rejects when already on the same active plan', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [tenantRow({
                  planTier: 'growth',
                  subscriptionStatus: 'active',
                  paddleSubscriptionId: 'sub_existing',
                })],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      await expect(caller.createCheckout({ planTier: 'growth' })).rejects.toThrow('Already on this plan');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels active subscription at next billing period', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [tenantRow({
                  subscriptionStatus: 'active',
                  paddleSubscriptionId: 'sub_cancel_001',
                })],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      mocks.paddleSubscriptionsCancel.mockResolvedValue({});

      const caller = createCaller(makeCtx(db));
      const result = await caller.cancelSubscription();

      expect(result).toEqual({ ok: true });
      expect(mocks.paddleSubscriptionsCancel).toHaveBeenCalledWith('sub_cancel_001', {
        effectiveFrom: 'next_billing_period',
      });
    });

    it('rejects when no active subscription', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [tenantRow()],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      await expect(caller.cancelSubscription()).rejects.toThrow('No active subscription to cancel');
    });
  });

  describe('history', () => {
    it('returns billing events', async () => {
      const fakeEvents = [
        { id: 'be1', type: 'transaction.completed', amountUsd: '249.00', createdAt: new Date() },
        { id: 'be2', type: 'transaction.completed', amountUsd: '99.00', createdAt: new Date() },
      ];

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => fakeEvents,
                }),
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.history({});

      expect(result).toEqual(fakeEvents);
    });

    it('returns empty array when no events', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => [],
                }),
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.history({});

      expect(result).toEqual([]);
    });
  });
});
