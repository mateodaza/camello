import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { db, tenants, billingEvents, createTenantDb } from '@camello/db';
import { COST_BUDGET_DEFAULTS } from '@camello/shared/constants';
import type { PlanTier } from '@camello/shared/types';
import { getPaddle, priceIdToTier, mapPaddleStatus } from '../lib/paddle.js';

// ---------------------------------------------------------------------------
// Paddle webhook routes
//
// Handles subscription lifecycle events from Paddle Billing.
// Follows the same pattern as Clerk webhooks (apps/api/src/webhooks/clerk.ts).
// ---------------------------------------------------------------------------

export const paddleWebhookRoutes = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Atomic claim: INSERT new event or re-claim a stale one.
 * Returns the claimed row, or null if already processed/failed/locked.
 *
 * ON CONFLICT refreshes event_type, occurred_at, processing_started_at, and
 * attempt_count so stale partial rows stay inspectable with latest retry context.
 */
async function claimEvent(
  eventId: string,
  eventType: string,
  occurredAt: string,
): Promise<{ claimed: boolean }> {
  const result = await db.execute(sql`
    INSERT INTO paddle_webhook_events (event_id, event_type, occurred_at, processing_started_at, attempt_count)
    VALUES (${eventId}, ${eventType}, ${occurredAt}::timestamptz, now(), 1)
    ON CONFLICT (event_id) DO UPDATE SET
      event_type = EXCLUDED.event_type,
      occurred_at = EXCLUDED.occurred_at,
      processing_started_at = now(),
      attempt_count = paddle_webhook_events.attempt_count + 1
    WHERE paddle_webhook_events.processed_at IS NULL
      AND paddle_webhook_events.failed_at IS NULL
      AND (
        paddle_webhook_events.processing_started_at IS NULL
        OR paddle_webhook_events.processing_started_at < now() - interval '60 seconds'
      )
    RETURNING id
  `);
  return { claimed: (result.rows as unknown[]).length > 0 };
}

/** Mark event as successfully processed. */
async function markProcessed(eventId: string, tenantId: string | null): Promise<void> {
  await db.execute(sql`
    UPDATE paddle_webhook_events
    SET processed_at = now(), tenant_id = ${tenantId}
    WHERE event_id = ${eventId}
  `);
}

/** Mark event as a terminal failure (poison event). Returns 200 to stop Paddle retries. */
async function markFailed(eventId: string, error: string): Promise<void> {
  await db.execute(sql`
    UPDATE paddle_webhook_events
    SET failed_at = now(), last_error = ${error}
    WHERE event_id = ${eventId}
  `);
}

/** Resolve tenant by Paddle subscription ID (SECURITY DEFINER RPC, bypasses RLS). */
async function resolveTenantBySubscription(
  subscriptionId: string,
): Promise<{ tenant_id: string; plan_tier: string; paddle_updated_at: string | null } | null> {
  const result = await db.execute(
    sql`SELECT * FROM resolve_tenant_by_paddle_subscription(${subscriptionId})`,
  );
  const row = (result.rows as Array<{ tenant_id: string; plan_tier: string; paddle_updated_at: string | null }>)[0];
  return row ?? null;
}

/**
 * Timestamp guard: skip if event is older than tenant's last processed event.
 * Returns true if the event should be skipped.
 */
function isStaleEvent(eventOccurredAt: string, tenantPaddleUpdatedAt: string | null): boolean {
  if (!tenantPaddleUpdatedAt) return false;
  return new Date(eventOccurredAt) <= new Date(tenantPaddleUpdatedAt);
}

/**
 * Determine whether a cancellation should actually downgrade the plan tier.
 * Only downgrade if canceled_at is in the past (billing period ended).
 */
function shouldDowngradeOnCancel(canceledAt: string | null | undefined): boolean {
  if (!canceledAt) return true; // No date = immediate cancellation
  return new Date(canceledAt) <= new Date();
}

// ---------------------------------------------------------------------------
// POST /paddle — Receive Paddle webhook events
// ---------------------------------------------------------------------------

paddleWebhookRoutes.post('/paddle', async (c) => {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[paddle-webhook] PADDLE_WEBHOOK_SECRET not configured');
    return c.text('Server misconfigured', 500);
  }

  // 1. Read raw body + signature header
  const rawBody = await c.req.text();
  const signature = c.req.header('paddle-signature') ?? '';

  if (!signature) {
    return c.text('Missing Paddle-Signature header', 400);
  }

  // 2. Verify signature + parse event
  let event: any;
  try {
    const paddle = getPaddle();
    event = paddle.webhooks.unmarshal(rawBody, secret, signature);
  } catch (err) {
    console.warn('[paddle-webhook] Invalid signature:', err);
    return c.text('Invalid signature', 400);
  }

  const eventId: string = event.eventId;
  const eventType: string = event.eventType;
  const occurredAt: string = event.occurredAt;

  // 3. Idempotency: atomic claim
  const { claimed } = await claimEvent(eventId, eventType, occurredAt);
  if (!claimed) {
    return c.json({ received: true }, 200);
  }

  // 4. Process by event type
  try {
    switch (eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(event, eventId);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(event, eventId);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(event, eventId);
        break;
      case 'transaction.completed':
        await handleTransactionCompleted(event, eventId);
        break;
      default:
        // Unknown event type — mark processed, no-op
        await markProcessed(eventId, null);
        break;
    }
  } catch (err) {
    // Transient failure — don't mark processed/failed, let lock expire for retry.
    // Return 500 so Paddle retries. The stale lock (60s) ensures the next
    // retry can re-claim the event even if this worker's lock hasn't expired.
    console.error(`[paddle-webhook] Error processing ${eventType}:`, err);
    return c.text('Processing failed', 500);
  }

  return c.json({ received: true }, 200);
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleSubscriptionCreated(event: any, eventId: string): Promise<void> {
  const data = event.data;
  const customData = data.customData as Record<string, string> | null;
  const tenantId = customData?.tenantId;

  if (!tenantId) {
    await markFailed(eventId, 'Missing tenantId in customData');
    return;
  }

  // Determine plan tier from first item's price ID
  const priceId = data.items?.[0]?.price?.id;
  const newTier = priceId ? priceIdToTier(priceId) : null;

  if (!newTier) {
    await markFailed(eventId, `Unknown price ID: ${priceId}`);
    return;
  }

  // Update tenant with subscription info
  const tenantDb = createTenantDb(tenantId);
  await tenantDb.query(async (qdb) => {
    await qdb.update(tenants).set({
      paddleSubscriptionId: data.id,
      paddleCustomerId: data.customerId,
      planTier: newTier,
      subscriptionStatus: mapPaddleStatus(data.status),
      paddleStatusRaw: data.status,
      paddleUpdatedAt: new Date(event.occurredAt),
      monthlyCostBudgetUsd: String(COST_BUDGET_DEFAULTS[newTier as PlanTier]),
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));
  });

  await markProcessed(eventId, tenantId);
}

async function handleSubscriptionUpdated(event: any, eventId: string): Promise<void> {
  const data = event.data;
  const subscriptionId = data.id;

  const tenant = await resolveTenantBySubscription(subscriptionId);
  if (!tenant) {
    // Transient: out-of-order delivery may mean subscription.created hasn't
    // been processed yet. Throw so the catch path returns 500 → Paddle retries.
    throw new Error(`No tenant found for subscription: ${subscriptionId}`);
  }

  // Timestamp guard
  if (isStaleEvent(event.occurredAt, tenant.paddle_updated_at)) {
    await markProcessed(eventId, tenant.tenant_id);
    return;
  }

  // Determine new plan tier from items
  const priceId = data.items?.[0]?.price?.id;
  const newTier = priceId ? priceIdToTier(priceId) : null;
  const mappedStatus = mapPaddleStatus(data.status);

  // Build update payload
  const updates: Record<string, unknown> = {
    subscriptionStatus: mappedStatus,
    paddleStatusRaw: data.status,
    paddleUpdatedAt: new Date(event.occurredAt),
    updatedAt: new Date(),
  };

  if (newTier && newTier !== tenant.plan_tier) {
    updates.planTier = newTier;
    updates.monthlyCostBudgetUsd = String(COST_BUDGET_DEFAULTS[newTier as PlanTier]);
  }

  // If status is canceled, gate downgrade on effective date
  if (mappedStatus === 'canceled') {
    if (shouldDowngradeOnCancel(data.canceledAt)) {
      updates.planTier = 'starter';
      updates.monthlyCostBudgetUsd = String(COST_BUDGET_DEFAULTS.starter);
    }
    // If canceledAt is in the future, we just update status but keep current tier
  }

  const tenantDb = createTenantDb(tenant.tenant_id);
  await tenantDb.query(async (qdb) => {
    await qdb.update(tenants).set(updates).where(eq(tenants.id, tenant.tenant_id));
  });

  await markProcessed(eventId, tenant.tenant_id);
}

async function handleSubscriptionCanceled(event: any, eventId: string): Promise<void> {
  const data = event.data;
  const subscriptionId = data.id;

  const tenant = await resolveTenantBySubscription(subscriptionId);
  if (!tenant) {
    // Transient: out-of-order delivery may mean subscription.created hasn't
    // been processed yet. Throw so the catch path returns 500 → Paddle retries.
    throw new Error(`No tenant found for subscription: ${subscriptionId}`);
  }

  // Timestamp guard
  if (isStaleEvent(event.occurredAt, tenant.paddle_updated_at)) {
    await markProcessed(eventId, tenant.tenant_id);
    return;
  }

  const updates: Record<string, unknown> = {
    subscriptionStatus: 'canceled' as const,
    paddleStatusRaw: data.status ?? 'canceled',
    paddleUpdatedAt: new Date(event.occurredAt),
    updatedAt: new Date(),
  };

  // Only downgrade tier if cancellation is effective now
  if (shouldDowngradeOnCancel(data.canceledAt)) {
    updates.planTier = 'starter';
    updates.monthlyCostBudgetUsd = String(COST_BUDGET_DEFAULTS.starter);
  }

  const tenantDb = createTenantDb(tenant.tenant_id);
  await tenantDb.query(async (qdb) => {
    await qdb.update(tenants).set(updates).where(eq(tenants.id, tenant.tenant_id));
  });

  await markProcessed(eventId, tenant.tenant_id);
}

async function handleTransactionCompleted(event: any, eventId: string): Promise<void> {
  const data = event.data;
  const customData = data.customData as Record<string, string> | null;
  const tenantId = customData?.tenantId;

  // For transactions tied to subscriptions, try subscription-based tenant resolution
  const subscriptionId = data.subscriptionId;
  let resolvedTenantId = tenantId;

  if (!resolvedTenantId && subscriptionId) {
    const tenant = await resolveTenantBySubscription(subscriptionId);
    resolvedTenantId = tenant?.tenant_id;
  }

  if (!resolvedTenantId) {
    await markFailed(eventId, 'Cannot resolve tenant for transaction');
    return;
  }

  // Log to billing_events (best-effort)
  const tenantDb = createTenantDb(resolvedTenantId);
  await tenantDb.query(async (qdb) => {
    await qdb.insert(billingEvents).values({
      tenantId: resolvedTenantId!,
      type: 'transaction.completed',
      amountUsd: data.details?.totals?.total
        ? String(Number(data.details.totals.total) / 100) // Paddle amounts are in smallest currency unit
        : null,
      paddleEventId: event.eventId,
    }).onConflictDoNothing();
  });

  await markProcessed(eventId, resolvedTenantId);
}
