import { Hono } from 'hono';
import { createTenantDb } from '@camello/db';
import {
  extractMetaMessage,
  findOrCreateWhatsAppCustomer,
  normalizeMetaMessage,
  whatsappAdapter,
  markWebhookProcessed,
} from '../adapters/whatsapp.js';
import { handleMessage } from '../orchestration/message-handler.js';
import { servicePool } from '../lib/service-pool.js';

export const internalRoutes = new Hono();

/**
 * POST /webhook-retry
 * Called exclusively by apps/jobs whatsapp-retry cron.
 * Protected by shared secret (not public — no Clerk, no tenant context on entry).
 *
 * 1. Validates x-internal-secret
 * 2. Fetches the webhook_events row JOIN channel_configs WHERE we.id = $1
 *      AND we.channel_type = 'whatsapp'   ← channel guard
 *      AND we.processed_at IS NULL        ← race-condition recheck
 *      AND cc.is_active = true            ← skip deactivated channels
 *    JOIN channel_configs cc ON cc.tenant_id = we.tenant_id ensures credentials are
 *    always sourced from the SAME tenant whose event is being retried.
 *    Returns 404 if row is missing, already processed, wrong channel type, or the
 *    tenant's WhatsApp channel_config has been deactivated.
 * 3. Runs the full WhatsApp pipeline for the stored payload
 * 4. Calls markWebhookProcessed on success.
 *    If sendText succeeds but markWebhookProcessed fails, we still return 200 —
 *    the message was delivered; do not retry and risk duplicates.
 */
internalRoutes.post('/webhook-retry', async (c) => {
  const secret = c.req.header('x-internal-secret');
  if (!secret || secret !== process.env.INTERNAL_RETRY_SECRET) {
    return c.text('Forbidden', 403);
  }

  let webhookEventId: string;
  try {
    ({ webhookEventId } = await c.req.json<{ webhookEventId: string }>());
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    // JOIN channel_configs on stored tenant_id — credentials tied to the original tenant.
    // cc.is_active = true — skip channels the tenant has since deactivated.
    // processed_at IS NULL — race-condition recheck against concurrent handlers.
    const { rows } = await servicePool.query<{
      tenant_id: string;
      external_id: string;
      payload: unknown;
      credentials: Record<string, unknown>;
      phone_number: string;
    }>(
      `SELECT we.tenant_id, we.external_id, we.payload,
              cc.credentials, cc.phone_number
       FROM webhook_events we
       JOIN channel_configs cc
         ON cc.tenant_id = we.tenant_id
        AND cc.channel_type = 'whatsapp'
        AND cc.is_active = true
       WHERE we.id = $1
         AND we.channel_type = 'whatsapp'
         AND we.processed_at IS NULL`,
      [webhookEventId],
    );

    if (!rows[0]) return c.text('Not found or already processed', 404);

    const { tenant_id, external_id, payload, credentials, phone_number } = rows[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extracted = extractMetaMessage(payload as any);
    if (!extracted) return c.text('OK', 200); // status-only event

    const tenantDb = createTenantDb(tenant_id);
    const customerId = await findOrCreateWhatsAppCustomer(
      tenantDb,
      tenant_id,
      extracted.contact.waId,
      extracted.contact.name,
    );

    const canonical = normalizeMetaMessage(
      extracted.message,
      tenant_id,
      customerId,
      extracted.contact.waId,
    );

    const result = await handleMessage({
      tenantDb,
      tenantId: tenant_id,
      channel: 'whatsapp',
      customerId,
      messageText: canonical.content.text ?? '[non-text message]',
    });

    await whatsappAdapter.sendText(
      extracted.contact.waId,
      result.responseText,
      { credentials, phoneNumber: phone_number },
    );

    // markWebhookProcessed is best-effort after a successful sendText.
    // If it fails, we still return 200 — the message was already delivered
    // to the customer. Retrying would cause duplicates.
    try {
      await markWebhookProcessed(tenant_id, external_id);
    } catch (markErr) {
      console.error('[internal/webhook-retry] markWebhookProcessed failed after successful sendText', {
        webhookEventId,
        tenantId: tenant_id,
        error: markErr instanceof Error ? markErr.message : String(markErr),
      });
    }

    return c.text('OK', 200);
  } catch (err) {
    console.error('[internal/webhook-retry] Pipeline failed', {
      webhookEventId,
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ error: 'Pipeline failed', detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
