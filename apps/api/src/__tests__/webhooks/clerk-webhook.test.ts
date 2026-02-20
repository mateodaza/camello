import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  provisionTenant: vi.fn(),
  svixVerify: vi.fn(),
}));

vi.mock('../../services/tenant-provisioning.js', () => ({
  provisionTenant: mocks.provisionTenant,
}));

vi.mock('svix', () => {
  class MockWebhook {
    verify(...args: unknown[]) {
      return mocks.svixVerify(...args);
    }
  }
  return { Webhook: MockWebhook };
});

import { clerkWebhookRoutes } from '../../webhooks/clerk.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_HEADERS = {
  'svix-id': 'msg_test123',
  'svix-timestamp': '1234567890',
  'svix-signature': 'v1,signature',
  'content-type': 'application/json',
};

function makeRequest(body: unknown, headers = VALID_HEADERS) {
  return new Request('http://localhost/clerk', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('clerk webhook handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLERK_WEBHOOK_SECRET', 'whsec_test_secret');
    mocks.provisionTenant.mockResolvedValue({
      tenantId: 'some-uuid',
      previewCustomerId: null,
      alreadyExisted: false,
    });
  });

  it('provisions tenant on valid organization.created event', async () => {
    const payload = {
      type: 'organization.created',
      data: {
        id: 'org_new123',
        name: 'New Corp',
        slug: 'new-corp',
        created_by: 'user_creator',
      },
    };

    mocks.svixVerify.mockReturnValue(payload);

    const res = await clerkWebhookRoutes.fetch(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    expect(mocks.provisionTenant).toHaveBeenCalledWith({
      orgId: 'org_new123',
      orgName: 'New Corp',
      orgSlug: 'new-corp',
      creatorUserId: 'user_creator',
    });
  });

  it('returns 400 on invalid Svix signature', async () => {
    mocks.svixVerify.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await clerkWebhookRoutes.fetch(makeRequest({ type: 'test' }));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid signature');
    expect(mocks.provisionTenant).not.toHaveBeenCalled();
  });

  it('returns 200 no-op for non-organization.created events', async () => {
    const payload = {
      type: 'user.created',
      data: { id: 'user_xxx' },
    };

    mocks.svixVerify.mockReturnValue(payload);

    const res = await clerkWebhookRoutes.fetch(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    expect(mocks.provisionTenant).not.toHaveBeenCalled();
  });

  it('returns 200 idempotently when tenant already provisioned', async () => {
    const payload = {
      type: 'organization.created',
      data: { id: 'org_existing', name: 'Existing', slug: 'existing' },
    };

    mocks.svixVerify.mockReturnValue(payload);
    mocks.provisionTenant.mockResolvedValue({
      tenantId: 'existing-uuid',
      previewCustomerId: null,
      alreadyExisted: true,
    });

    const res = await clerkWebhookRoutes.fetch(makeRequest(payload));

    expect(res.status).toBe(200);
    expect(mocks.provisionTenant).toHaveBeenCalledOnce();
  });

  it('returns 500 when CLERK_WEBHOOK_SECRET is missing', async () => {
    vi.stubEnv('CLERK_WEBHOOK_SECRET', '');

    const res = await clerkWebhookRoutes.fetch(makeRequest({ type: 'test' }));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Server misconfigured');
  });

  it('returns 400 when Svix headers are missing', async () => {
    mocks.svixVerify.mockReturnValue({ type: 'test' });

    const req = new Request('http://localhost/clerk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const res = await clerkWebhookRoutes.fetch(req);

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing Svix headers');
  });

  it('returns 500 when provisionTenant throws (triggers Svix retry)', async () => {
    const payload = {
      type: 'organization.created',
      data: { id: 'org_fail', name: 'Fail Corp', slug: 'fail' },
    };

    mocks.svixVerify.mockReturnValue(payload);
    mocks.provisionTenant.mockRejectedValue(new Error('DB connection lost'));

    const res = await clerkWebhookRoutes.fetch(makeRequest(payload));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Provisioning failed');
  });

  it('passes null creatorUserId when created_by is absent', async () => {
    const payload = {
      type: 'organization.created',
      data: { id: 'org_noCB', name: 'No Creator', slug: 'no-creator' },
    };

    mocks.svixVerify.mockReturnValue(payload);

    await clerkWebhookRoutes.fetch(makeRequest(payload));

    expect(mocks.provisionTenant).toHaveBeenCalledWith(
      expect.objectContaining({ creatorUserId: null }),
    );
  });
});
