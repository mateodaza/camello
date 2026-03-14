import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
  getWhatsappTenantIds,
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
 * Responds with the challenge token if the verify_token matches any tenant's
 * per-tenant HMAC token (HMAC-SHA256 of tenantId with WA_VERIFY_TOKEN_SECRET).
 * All tenants are checked — not just those with existing channel_configs rows —
 * so first-time setup works before any channel row is saved.
 */
whatsappRoutes.get('/webhook', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const secret = process.env.WA_VERIFY_TOKEN_SECRET;
  if (!secret) {
    console.error('[whatsapp] WA_VERIFY_TOKEN_SECRET not configured');
    return c.text('Server misconfigured', 500);
  }

  if (mode !== 'subscribe' || !token) {
    return c.text('Forbidden', 403);
  }

  let tenantIds: string[];
  try {
    tenantIds = await getWhatsappTenantIds();
  } catch (err) {
    console.error('[whatsapp] Failed to fetch tenant IDs for webhook verification:', err);
    return c.text('Server error', 500);
  }

  const tokenBuf = Buffer.from(token, 'utf8');
  const matched = tenantIds.some((tenantId) => {
    const expected = Buffer.from(
      createHmac('sha256', secret).update(tenantId).digest('hex').slice(0, 32),
      'utf8',
    );
    return expected.length === tokenBuf.length && timingSafeEqual(expected, tokenBuf);
  });

  if (matched) {
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
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    console.warn('[whatsapp] Received malformed JSON body');
    return c.text('Bad Request', 400);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extracted = extractMetaMessage(payload as any);

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
  //    The webhookEvents row (processed_at = NULL) acts as a dead-letter queue.
  //    No automatic retry job exists today — add a node-cron job in apps/jobs/
  //    to sweep rows older than N minutes if retry durability is required.
  const tenantId = resolved.tenantId;
  const credentials = resolved.credentials;
  const externalId = message.id;

  setImmediate(async () => {
    try {
      // a. Find-or-create customer
      const tenantDb = createTenantDb(tenantId);
      const customerId = await findOrCreateWhatsAppCustomer(
        tenantDb,
        tenantId,
        contact.waId,
        contact.name,
      );

      // b. Normalise to CanonicalMessage
      const _canonical = normalizeMetaMessage(message, tenantId, customerId, contact.waId);

      // c. Run full orchestration pipeline
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
      // The webhookEvents row remains with processed_at = NULL (no automatic retry today).
    }
  });

  return c.text('OK', 200);
});
