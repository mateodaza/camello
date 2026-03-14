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
 *    JOIN channel_configs cc ON cc.tenant_id = we.tenant_id ensures credentials are
 *    always sourced from the SAME tenant whose event is being retried. If the phone
 *    number has since been reassigned to another tenant, the JOIN still returns the
 *    original tenant's credentials — no cross-tenant leak is possible.
 *    Returns 404 if row is missing, already processed, wrong channel type, or the
 *    tenant no longer has an active WhatsApp channel_config.
 * 3. Runs the full WhatsApp pipeline for the stored payload
 * 4. Calls markWebhookProcessed on success
 */
internalRoutes.post('/webhook-retry', async (c) => {
  const secret = c.req.header('x-internal-secret');
  if (!secret || secret !== process.env.INTERNAL_RETRY_SECRET) {
    return c.text('Forbidden', 403);
  }

  const { webhookEventId } = await c.req.json<{ webhookEventId: string }>();

  // JOIN channel_configs on stored tenant_id — credentials are tied to the original
  // tenant, never to whoever currently owns the phone number globally.
  // channel_type = 'whatsapp' in both tables scopes this to WhatsApp only.
  // processed_at IS NULL prevents duplicate processing (race-condition recheck).
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

  await markWebhookProcessed(tenant_id, external_id);

  return c.text('OK', 200);
});
