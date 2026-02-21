import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  unmarshal: vi.fn(),
  poolQuery: vi.fn(),
  tenantDbQuery: vi.fn(),
}));

vi.mock('@paddle/paddle-node-sdk', () => {
  class MockPaddle {
    webhooks = { unmarshal: mocks.unmarshal };
  }
  return { Paddle: MockPaddle, Environment: { sandbox: 'sandbox', production: 'production' } };
});

vi.mock('@camello/db', () => {
  const pool = { query: mocks.poolQuery };
  return {
    pool,
    tenants: { _table: 'tenants', id: 'id' },
    billingEvents: { _table: 'billingEvents' },
    createTenantDb: () => ({ query: mocks.tenantDbQuery }),
  };
});

vi.mock('@camello/shared/constants', () => ({
  COST_BUDGET_DEFAULTS: { starter: 5, growth: 25, scale: 100 },
}));

vi.mock('../../lib/paddle.js', async () => {
  const { Paddle, Environment } = await import('@paddle/paddle-node-sdk');
  return {
    getPaddle: () => new Paddle('test_key', { environment: Environment.sandbox }),
    priceIdToTier: (id: string) => {
      if (id === 'pri_starter') return 'starter';
      if (id === 'pri_growth') return 'growth';
      if (id === 'pri_scale') return 'scale';
      return null;
    },
    mapPaddleStatus: (raw: string) => {
      const map: Record<string, string> = {
        active: 'active',
        past_due: 'past_due',
        canceled: 'canceled',
        paused: 'paused',
        trialing: 'trialing',
      };
      return map[raw] ?? 'past_due';
    },
  };
});

import { paddleWebhookRoutes } from '../../webhooks/paddle.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: string, signature = 'ts=123;h1=abc') {
  return new Request('http://localhost/paddle', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signature,
    },
    body,
  });
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'evt_test_001',
    eventType: 'subscription.created',
    occurredAt: '2026-02-15T10:00:00Z',
    data: {
      id: 'sub_test_123',
      customerId: 'ctm_test_456',
      status: 'active',
      customData: { tenantId: '00000000-0000-0000-0000-000000000001' },
      items: [{ price: { id: 'pri_growth' } }],
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('paddle webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PADDLE_WEBHOOK_SECRET', 'pdl_ntfset_test');
    vi.stubEnv('PADDLE_API_KEY', 'test_key');

    // Default: claim succeeds (returns a row)
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 'claimed-uuid' }] });
    // Default: tenantDb.query executes the callback
    mocks.tenantDbQuery.mockImplementation(async (fn: any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({}),
          }),
        }),
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({}),
          }),
        }),
      };
      return fn(mockDb);
    });
  });

  it('returns 500 when PADDLE_WEBHOOK_SECRET not configured', async () => {
    vi.stubEnv('PADDLE_WEBHOOK_SECRET', '');

    const res = await paddleWebhookRoutes.fetch(makeRequest('{}'));
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Server misconfigured');
  });

  it('returns 400 when Paddle-Signature header is missing', async () => {
    const req = new Request('http://localhost/paddle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const res = await paddleWebhookRoutes.fetch(req);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing Paddle-Signature header');
  });

  it('returns 400 on invalid signature', async () => {
    mocks.unmarshal.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await paddleWebhookRoutes.fetch(makeRequest('{}'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
  });

  it('handles subscription.created — updates tenant plan + paddle fields', async () => {
    const event = makeEvent();
    mocks.unmarshal.mockReturnValue(event);

    // claim succeeds
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 'claimed' }] });

    let setPayload: any = null;
    mocks.tenantDbQuery.mockImplementation(async (fn: any) => {
      const mockDb = {
        update: () => ({
          set: (data: any) => {
            setPayload = data;
            return { where: () => ({}) };
          },
        }),
      };
      return fn(mockDb);
    });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(setPayload).toMatchObject({
      paddleSubscriptionId: 'sub_test_123',
      paddleCustomerId: 'ctm_test_456',
      planTier: 'growth',
      subscriptionStatus: 'active',
      monthlyCostBudgetUsd: '25',
    });
  });

  it('marks event failed when tenantId missing in customData (subscription.created)', async () => {
    const event = makeEvent({
      data: {
        id: 'sub_test_123',
        customerId: 'ctm_test_456',
        status: 'active',
        customData: null,
        items: [{ price: { id: 'pri_growth' } }],
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    // claim + markFailed = 2 pool.query calls, no tenantDb interaction
    expect(mocks.poolQuery.mock.calls.length).toBe(2);
    expect(mocks.tenantDbQuery).not.toHaveBeenCalled();
  });

  it('marks event failed for unknown price ID', async () => {
    const event = makeEvent({
      data: {
        id: 'sub_test_123',
        customerId: 'ctm_test_456',
        status: 'active',
        customData: { tenantId: '00000000-0000-0000-0000-000000000001' },
        items: [{ price: { id: 'pri_unknown' } }],
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    // Should call markFailed
    expect(mocks.poolQuery.mock.calls.length).toBeGreaterThan(1);
  });

  it('skips already-processed event (idempotent)', async () => {
    const event = makeEvent();
    mocks.unmarshal.mockReturnValue(event);
    // Claim returns empty → already processed
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
    // tenantDb should NOT have been called
    expect(mocks.tenantDbQuery).not.toHaveBeenCalled();
  });

  it('handles subscription.updated with plan change', async () => {
    const event = makeEvent({
      eventType: 'subscription.updated',
      data: {
        id: 'sub_existing_789',
        status: 'active',
        items: [{ price: { id: 'pri_scale' } }],
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    // claim succeeds
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'claimed' }] }) // claim
      .mockResolvedValueOnce({ // resolveTenantBySubscription
        rows: [{
          tenant_id: '00000000-0000-0000-0000-000000000001',
          plan_tier: 'growth',
          paddle_updated_at: '2026-02-10T00:00:00Z',
        }],
      })
      .mockResolvedValue({ rows: [] }); // markProcessed

    let setPayload: any = null;
    mocks.tenantDbQuery.mockImplementation(async (fn: any) => {
      const mockDb = {
        update: () => ({
          set: (data: any) => {
            setPayload = data;
            return { where: () => ({}) };
          },
        }),
      };
      return fn(mockDb);
    });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(setPayload).toMatchObject({
      planTier: 'scale',
      monthlyCostBudgetUsd: '100',
      subscriptionStatus: 'active',
    });
  });

  it('skips stale subscription.updated event (timestamp guard)', async () => {
    const event = makeEvent({
      eventType: 'subscription.updated',
      occurredAt: '2026-02-01T00:00:00Z', // OLDER than tenant
      data: {
        id: 'sub_existing_789',
        status: 'active',
        items: [{ price: { id: 'pri_scale' } }],
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'claimed' }] })
      .mockResolvedValueOnce({
        rows: [{
          tenant_id: '00000000-0000-0000-0000-000000000001',
          plan_tier: 'growth',
          paddle_updated_at: '2026-02-10T00:00:00Z', // NEWER
        }],
      })
      .mockResolvedValue({ rows: [] });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    // Should NOT have updated tenant (no tenantDb.query call for update)
    expect(mocks.tenantDbQuery).not.toHaveBeenCalled();
  });

  it('handles subscription.canceled with past canceled_at — downgrades to starter', async () => {
    const event = makeEvent({
      eventType: 'subscription.canceled',
      data: {
        id: 'sub_cancel_001',
        status: 'canceled',
        canceledAt: '2026-02-14T00:00:00Z', // in the past
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'claimed' }] })
      .mockResolvedValueOnce({
        rows: [{
          tenant_id: '00000000-0000-0000-0000-000000000001',
          plan_tier: 'growth',
          paddle_updated_at: null,
        }],
      })
      .mockResolvedValue({ rows: [] });

    let setPayload: any = null;
    mocks.tenantDbQuery.mockImplementation(async (fn: any) => {
      const mockDb = {
        update: () => ({
          set: (data: any) => {
            setPayload = data;
            return { where: () => ({}) };
          },
        }),
      };
      return fn(mockDb);
    });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(setPayload).toMatchObject({
      planTier: 'starter',
      monthlyCostBudgetUsd: '5',
      subscriptionStatus: 'canceled',
    });
  });

  it('handles subscription.canceled with future canceled_at — keeps current tier', async () => {
    const event = makeEvent({
      eventType: 'subscription.canceled',
      data: {
        id: 'sub_cancel_002',
        status: 'canceled',
        canceledAt: '2099-12-31T00:00:00Z', // far future
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'claimed' }] })
      .mockResolvedValueOnce({
        rows: [{
          tenant_id: '00000000-0000-0000-0000-000000000001',
          plan_tier: 'growth',
          paddle_updated_at: null,
        }],
      })
      .mockResolvedValue({ rows: [] });

    let setPayload: any = null;
    mocks.tenantDbQuery.mockImplementation(async (fn: any) => {
      const mockDb = {
        update: () => ({
          set: (data: any) => {
            setPayload = data;
            return { where: () => ({}) };
          },
        }),
      };
      return fn(mockDb);
    });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(setPayload.subscriptionStatus).toBe('canceled');
    // Should NOT have planTier set (keeps current)
    expect(setPayload.planTier).toBeUndefined();
  });

  it('handles transaction.completed — logs billing event', async () => {
    const event = makeEvent({
      eventType: 'transaction.completed',
      data: {
        id: 'txn_001',
        subscriptionId: 'sub_existing_789',
        customData: { tenantId: '00000000-0000-0000-0000-000000000001' },
        details: { totals: { total: '24900' } }, // $249.00 in cents
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    let insertedValues: any = null;
    mocks.tenantDbQuery.mockImplementation(async (fn: any) => {
      const mockDb = {
        insert: () => ({
          values: (data: any) => {
            insertedValues = data;
            return { onConflictDoNothing: () => ({}) };
          },
        }),
      };
      return fn(mockDb);
    });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    expect(insertedValues).toMatchObject({
      tenantId: '00000000-0000-0000-0000-000000000001',
      type: 'transaction.completed',
      amountUsd: '249',
      paddleEventId: 'evt_test_001',
    });
  });

  it('returns 200 no-op for unknown event types', async () => {
    const event = makeEvent({ eventType: 'customer.updated' });
    mocks.unmarshal.mockReturnValue(event);

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(200);
    // Should call markProcessed (second pool.query), but NOT tenantDb
    expect(mocks.tenantDbQuery).not.toHaveBeenCalled();
  });

  it('returns 500 when no tenant found for subscription (updated) — transient for retry', async () => {
    const event = makeEvent({
      eventType: 'subscription.updated',
      data: {
        id: 'sub_orphan_999',
        status: 'active',
        items: [{ price: { id: 'pri_growth' } }],
      },
    });
    mocks.unmarshal.mockReturnValue(event);

    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'claimed' }] })
      .mockResolvedValueOnce({ rows: [] }) // no tenant found
      .mockResolvedValue({ rows: [] });

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    // Missing tenant is transient (out-of-order delivery), so return 500 for Paddle retry
    expect(res.status).toBe(500);
    // Should NOT have called markFailed — lock will expire for re-claim
    expect(mocks.tenantDbQuery).not.toHaveBeenCalled();
  });

  it('returns 500 on transient error so Paddle retries', async () => {
    const event = makeEvent();
    mocks.unmarshal.mockReturnValue(event);

    // Claim succeeds, but tenantDb throws transient error
    mocks.tenantDbQuery.mockRejectedValue(new Error('Connection timeout'));

    const res = await paddleWebhookRoutes.fetch(makeRequest(JSON.stringify(event)));

    expect(res.status).toBe(500);
  });
});
