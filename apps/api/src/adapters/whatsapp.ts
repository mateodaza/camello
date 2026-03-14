import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { pool } from '@camello/db';
import { webhookEvents, customers } from '@camello/db';
import { createTenantDb } from '@camello/db';
import type { TenantDb } from '@camello/db';
import type { CanonicalMessage } from '@camello/shared/types';
import type { ChannelAdapter, ChannelConfig } from './types.js';

// ---------------------------------------------------------------------------
// WhatsApp Cloud API adapter (Meta Business Platform v21.0)
// ---------------------------------------------------------------------------

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/** Verify Meta webhook signature on raw request bytes. Uses timingSafeEqual. */
export function verifyWhatsAppSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected),
    );
  } catch {
    // Length mismatch
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tenant resolution — SECURITY DEFINER RPC (bypasses RLS)
// ---------------------------------------------------------------------------

/**
 * Resolve tenant_id from Meta's phone_number_id using a SECURITY DEFINER RPC.
 * This bypasses RLS because we don't know the tenant_id yet at this point.
 * The RPC narrows access to only return (tenant_id, credentials) for active configs.
 */
export async function resolveTenantByPhoneNumberId(
  phoneNumberId: string,
): Promise<{ tenantId: string; credentials: Record<string, unknown> } | null> {
  // pool.query() instead of db.execute(sql`...`) — Drizzle sql tag produces malformed SQL when
  // bundled with tsup noExternal. SECURITY DEFINER RPC bypasses RLS (no tenant context yet).
  const result = await pool.query<{ tenant_id: string; credentials: unknown }>(
    `SELECT * FROM resolve_channel_config_by_phone('whatsapp', $1)`,
    [phoneNumberId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    credentials: (row.credentials ?? {}) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// WhatsApp tenant enumeration — SECURITY DEFINER RPC (bypasses RLS)
// ---------------------------------------------------------------------------

/**
 * Return all tenant_ids in the platform.
 * Used by GET /webhook to verify per-tenant HMAC tokens without a known tenant context.
 * Returns ALL tenants (not just those with channel_configs rows) so that first-time
 * setup works: Meta's webhook challenge fires before any channel_configs row exists.
 */
export async function getWhatsappTenantIds(): Promise<string[]> {
  // pool.query() instead of db.execute(sql`...`) — Drizzle sql tag produces malformed SQL when
  // bundled with tsup noExternal. SECURITY DEFINER RPC returns all tenants (no RLS context needed).
  const result = await pool.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM get_whatsapp_tenant_ids()',
  );
  return result.rows.map((r) => r.tenant_id);
}

// ---------------------------------------------------------------------------
// Phone number ID verification — Meta Graph API
// ---------------------------------------------------------------------------

/**
 * Verify a WhatsApp phone number ID + access token against Meta Graph API.
 * Returns the display_phone_number on success, null on any failure.
 * Called by channel.verifyWhatsapp tRPC procedure.
 */
export async function verifyPhoneNumberId(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ displayPhoneNumber: string } | null> {
  const url = `${GRAPH_API_BASE}/${phoneNumberId}?fields=display_phone_number`;
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    // Network-level failure (DNS, timeout, connection reset) — log for ops visibility
    console.error('[verifyPhoneNumberId] Network error reaching Meta Graph API:', err);
    return null;
  }

  if (!response.ok) {
    // Log status so we can tell 401 (bad creds) from 429/503 (Meta issues) in logs
    console.warn(`[verifyPhoneNumberId] Meta Graph API returned ${response.status} for phoneNumberId=${phoneNumberId}`);
    return null;
  }

  let data: { display_phone_number?: string };
  try {
    data = (await response.json()) as { display_phone_number?: string };
  } catch (err) {
    console.error('[verifyPhoneNumberId] Failed to parse Meta Graph API response as JSON:', err);
    return null;
  }

  if (!data.display_phone_number) return null;
  return { displayPhoneNumber: data.display_phone_number };
}

// ---------------------------------------------------------------------------
// Customer find-or-create
// ---------------------------------------------------------------------------

export async function findOrCreateWhatsAppCustomer(
  tenantDb: TenantDb,
  tenantId: string,
  waId: string,
  profileName?: string,
): Promise<string> {
  return tenantDb.transaction(async (tx) => {
    // Advisory lock on tenantId: serialize all concurrent customer upserts for this tenant
    // so the Visitor N sequential numbering is gapless.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`);

    const nameValue = profileName ?? null;

    const rows = await tx
      .insert(customers)
      .values({
        tenantId,
        channel: 'whatsapp',
        externalId: waId,
        name: nameValue,
        phone: waId,
      })
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.channel, customers.externalId],
        set: { lastSeenAt: new Date() },
      })
      .returning({ id: customers.id, xmax: sql<string>`xmax` });

    const row = rows[0];
    // xmax=0 means fresh INSERT; non-zero means ON CONFLICT DO UPDATE
    const isNewInsert = String(row.xmax) === '0';

    if (isNewInsert && nameValue === null) {
      const countRows = await tx
        .select({ count: sql<string>`COUNT(*)` })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), sql`${customers.displayName} IS NOT NULL`));
      const seq = Number(countRows[0]?.count ?? 0);
      await tx
        .update(customers)
        .set({ displayName: `Visitor ${seq + 1}` })
        .where(and(eq(customers.id, row.id), eq(customers.tenantId, tenantId)));
    }

    return row.id;
  });
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Attempt atomic webhook dedup. Returns true if this is a NEW event (process it).
 * Returns false if duplicate (skip).
 * Uses tenantDb (RLS-safe) since we have the tenant_id at this point.
 */
export async function insertWebhookEvent(
  tenantId: string,
  externalId: string,
  payload: unknown,
): Promise<boolean> {
  const tenantDb = createTenantDb(tenantId);
  const result = await tenantDb.query(async (qdb) => {
    return qdb
      .insert(webhookEvents)
      .values({
        tenantId,
        channelType: 'whatsapp',
        externalId,
        payload,
      })
      .onConflictDoNothing({
        target: [webhookEvents.tenantId, webhookEvents.channelType, webhookEvents.externalId],
      });
  });

  // node-pg returns rowCount = 0 when ON CONFLICT DO NOTHING skips
  return (result as any).rowCount > 0;
}

/** Mark a webhook event as processed. Uses tenantDb (RLS-safe). */
export async function markWebhookProcessed(
  tenantId: string,
  externalId: string,
): Promise<void> {
  const tenantDb = createTenantDb(tenantId);
  await tenantDb.query(async (qdb) => {
    return qdb
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(
        and(
          eq(webhookEvents.tenantId, tenantId),
          eq(webhookEvents.channelType, 'whatsapp'),
          eq(webhookEvents.externalId, externalId),
        ),
      );
  });
}

// ---------------------------------------------------------------------------
// Message parsing — Meta webhook payload → CanonicalMessage
// ---------------------------------------------------------------------------

interface MetaWebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<MetaMessage>;
        statuses?: Array<unknown>;
      };
    }>;
  }>;
}

interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

/** Extract the first message from a Meta webhook payload, or null if status-only. */
export function extractMetaMessage(payload: MetaWebhookPayload): {
  phoneNumberId: string;
  message: MetaMessage;
  contact: { name?: string; waId: string };
} | null {
  const change = payload.entry?.[0]?.changes?.[0]?.value;
  if (!change?.messages?.[0]) return null; // status update, no message

  const message = change.messages[0];
  const phoneNumberId = change.metadata?.phone_number_id ?? '';
  const contact = change.contacts?.[0];

  return {
    phoneNumberId,
    message,
    contact: {
      name: contact?.profile?.name,
      waId: contact?.wa_id ?? message.from,
    },
  };
}

/** Normalise a Meta message into CanonicalMessage. */
export function normalizeMetaMessage(
  msg: MetaMessage,
  tenantId: string,
  customerId: string,
  waId: string,
): CanonicalMessage {
  const content = (() => {
    switch (msg.type) {
      case 'text':
        return { type: 'text' as const, text: msg.text?.body ?? '' };
      case 'image':
        return {
          type: 'image' as const,
          media_url: msg.image?.id,
          mime_type: msg.image?.mime_type,
          caption: msg.image?.caption,
        };
      case 'audio':
        return {
          type: 'audio' as const,
          media_url: msg.audio?.id,
          mime_type: msg.audio?.mime_type,
        };
      case 'document':
        return {
          type: 'document' as const,
          media_url: msg.document?.id,
          mime_type: msg.document?.mime_type,
          caption: msg.document?.caption,
        };
      case 'location':
        return {
          type: 'location' as const,
          location: {
            lat: msg.location?.latitude ?? 0,
            lng: msg.location?.longitude ?? 0,
          },
        };
      case 'interactive': {
        const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
        return {
          type: 'interactive' as const,
          text: reply?.title ?? '',
          buttons: reply ? [{ id: reply.id, title: reply.title }] : [],
        };
      }
      default:
        return { type: 'text' as const, text: `[Unsupported message type: ${msg.type}]` };
    }
  })();

  return {
    id: randomUUID(),
    channel: 'whatsapp',
    direction: 'inbound',
    tenant_id: tenantId,
    customer_id: customerId,
    channel_customer_id: waId,
    content,
    metadata: {
      channel_message_id: msg.id,
      channel_timestamp: new Date(Number(msg.timestamp) * 1000),
      raw_payload: msg as unknown as Record<string, unknown>,
    },
    created_at: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Outbound — WhatsApp Cloud API calls
// ---------------------------------------------------------------------------

async function graphPost(
  phoneNumberId: string,
  payload: unknown,
  accessToken: string,
): Promise<string> {
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`WhatsApp API error ${res.status}: ${error}`);
  }

  const data = (await res.json()) as { messages?: Array<{ id: string }> };
  return data.messages?.[0]?.id ?? '';
}

function getAccessToken(config: ChannelConfig): string {
  const token = config.credentials?.access_token;
  if (typeof token !== 'string' || !token) {
    throw new Error('WhatsApp access_token not configured');
  }
  return token;
}

function getPhoneNumberId(config: ChannelConfig): string {
  if (!config.phoneNumber) throw new Error('WhatsApp phone_number_id not configured');
  return config.phoneNumber;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export const whatsappAdapter: ChannelAdapter = {
  channel: 'whatsapp',

  parseInbound(_payload: unknown): CanonicalMessage {
    // This is called after extractMetaMessage + normalizeMetaMessage in the webhook handler.
    // The adapter interface requires this method, but the WhatsApp flow uses the
    // more granular extractMetaMessage / normalizeMetaMessage functions directly.
    throw new Error('Use extractMetaMessage + normalizeMetaMessage for WhatsApp');
  },

  async sendText(to, text, config) {
    return graphPost(getPhoneNumberId(config), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }, getAccessToken(config));
  },

  async sendInteractive(to, text, buttons, config) {
    return graphPost(getPhoneNumberId(config), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    }, getAccessToken(config));
  },

  async sendMedia(to, mediaUrl, caption, config) {
    return graphPost(getPhoneNumberId(config), {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: { link: mediaUrl, caption },
    }, getAccessToken(config));
  },

  async markRead(messageId, config) {
    await graphPost(getPhoneNumberId(config), {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }, getAccessToken(config));
  },
};
