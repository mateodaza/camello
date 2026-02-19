import { Hono } from 'hono';
import { createTenantDb } from '@camello/db';
import {
  verifyWhatsAppSignature,
  resolveTenantByPhoneNumberId,
  findOrCreateWhatsAppCustomer,
  insertWebhookEvent,
  markWebhookProcessed,
  extractMetaMessage,
  normalizeMetaMessage,
  whatsappAdapter,
} from '../adapters/whatsapp.js';
import { handleMessage } from '../orchestration/message-handler.js';

// ---------------------------------------------------------------------------
// WhatsApp webhook routes
//
// CRITICAL: POST handler returns 200 FAST before processing.
// Meta retries webhooks after ~20s timeout.
// ---------------------------------------------------------------------------

export const whatsappRoutes = new Hono();

/**
 * GET /webhook — Meta verification challenge.
 *
 * Meta sends this when you register a webhook URL.
 * Responds with the challenge token if verify_token matches.
 */
whatsappRoutes.get('/webhook', (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const verifyToken = process.env.WA_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error('[whatsapp] WA_VERIFY_TOKEN not configured');
    return c.text('Server misconfigured', 500);
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return c.text(challenge ?? '', 200);
  }

  return c.text('Forbidden', 403);
});

/**
 * POST /webhook — Receive inbound WhatsApp messages.
 *
 * Flow:
 * 1. Verify HMAC-SHA256 signature on raw bytes
 * 2. Parse JSON, extract phone_number_id → resolve tenant
 * 3. Atomic idempotency check (INSERT ON CONFLICT DO NOTHING)
 * 4. Return 200 immediately
 * 5. Process message asynchronously (fire-and-forget)
 */
whatsappRoutes.post('/webhook', async (c) => {
  // 1. Read raw body for signature verification
  const rawBody = new Uint8Array(await c.req.raw.arrayBuffer());
  const signatureHeader = c.req.header('x-hub-signature-256') ?? null;
  const appSecret = process.env.WA_APP_SECRET;

  if (!appSecret) {
    console.error('[whatsapp] WA_APP_SECRET not configured');
    return c.text('OK', 200); // Don't reveal misconfiguration to Meta
  }

  // 2. Verify signature
  if (!verifyWhatsAppSignature(rawBody, signatureHeader, appSecret)) {
    console.warn('[whatsapp] Invalid webhook signature');
    return c.text('Unauthorized', 401);
  }

  // 3. Parse payload
  const payload = JSON.parse(new TextDecoder().decode(rawBody));
  const extracted = extractMetaMessage(payload);

  // Status updates (delivered/read) — acknowledge, don't process
  if (!extracted) {
    return c.text('OK', 200);
  }

  const { phoneNumberId, message, contact } = extracted;

  // 4. Resolve tenant from phone_number_id
  const resolved = await resolveTenantByPhoneNumberId(phoneNumberId);
  if (!resolved) {
    console.warn(`[whatsapp] Unknown phone_number_id: ${phoneNumberId}`);
    return c.text('OK', 200); // Don't expose tenant resolution failures
  }

  // 5. Atomic idempotency — INSERT ON CONFLICT DO NOTHING
  const isNew = await insertWebhookEvent(resolved.tenantId, message.id, payload);
  if (!isNew) {
    // Duplicate — already processed
    return c.text('OK', 200);
  }

  // 6. Return 200 immediately, then process async
  //    Using setImmediate to defer processing after the response is sent.
  //    The webhookEvents row (processed_at = NULL) is durable: if the process
  //    crashes, a future Trigger.dev worker (#35) can retry unprocessed events.
  const tenantId = resolved.tenantId;
  const credentials = resolved.credentials;
  const externalId = message.id;

  setImmediate(async () => {
    try {
      // a. Find-or-create customer
      const customerId = await findOrCreateWhatsAppCustomer(
        tenantId,
        contact.waId,
        contact.name,
      );

      // b. Normalise to CanonicalMessage
      const _canonical = normalizeMetaMessage(message, tenantId, customerId, contact.waId);

      // c. Run full orchestration pipeline
      const tenantDb = createTenantDb(tenantId);
      const result = await handleMessage({
        tenantDb,
        tenantId,
        channel: 'whatsapp',
        customerId,
        messageText: _canonical.content.text ?? '[non-text message]',
      });

      // d. Send response back via WhatsApp
      await whatsappAdapter.sendText(
        contact.waId,
        result.responseText,
        { credentials, phoneNumber: phoneNumberId },
      );

      // e. Mark webhook as processed
      await markWebhookProcessed(tenantId, externalId);
    } catch (err) {
      console.error('[whatsapp] Async processing error:', err);
      // The webhookEvents row stays with processed_at = NULL.
      // A future Trigger.dev worker can pick it up for retry.
    }
  });

  return c.text('OK', 200);
});
