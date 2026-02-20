import { Hono } from 'hono';
import { Webhook } from 'svix';
import { provisionTenant } from '../services/tenant-provisioning.js';

// ---------------------------------------------------------------------------
// Clerk webhook routes
//
// Handles organization lifecycle events from Clerk (via Svix).
// Primary use: auto-provision a tenant row when a new org is created.
// ---------------------------------------------------------------------------

export const clerkWebhookRoutes = new Hono();

interface ClerkOrgCreatedEvent {
  type: 'organization.created';
  data: {
    id: string;
    name: string;
    slug: string;
    created_by: string | undefined;
  };
}

interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * POST /clerk — Receive Clerk webhook events.
 *
 * Flow:
 * 1. Verify Svix signature on raw body
 * 2. Dispatch by event type (only organization.created for now)
 * 3. Call shared provisionTenant() for idempotent tenant creation
 * 4. Return 200
 */
clerkWebhookRoutes.post('/clerk', async (c) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[clerk-webhook] CLERK_WEBHOOK_SECRET not configured');
    return c.text('Server misconfigured', 500);
  }

  // 1. Read raw body for Svix signature verification
  const rawBody = await c.req.text();

  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.text('Missing Svix headers', 400);
  }

  // 2. Verify signature
  let event: ClerkWebhookEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.warn('[clerk-webhook] Invalid Svix signature:', err);
    return c.text('Invalid signature', 400);
  }

  // 3. Dispatch by event type
  if (event.type !== 'organization.created') {
    // Acknowledge but don't process — we only handle org creation for now
    return c.text('OK', 200);
  }

  const orgEvent = event as unknown as ClerkOrgCreatedEvent;
  const { id: orgId, name: orgName, slug: orgSlug, created_by } = orgEvent.data;

  // 4. Provision tenant (idempotent — safe against webhook retries)
  try {
    await provisionTenant({
      orgId,
      orgName,
      orgSlug,
      creatorUserId: created_by ?? null,
    });
  } catch (err) {
    console.error('[clerk-webhook] Provisioning failed:', err);
    // Return 500 so Svix retries
    return c.text('Provisioning failed', 500);
  }

  return c.text('OK', 200);
});
