import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db, createTenantDb } from '@camello/db';
import type { TenantDb } from '@camello/db';
import { customers, conversations, messages, artifacts, tenants, artifactModules, modules } from '@camello/db';
import { getQuickActionsForModules } from '@camello/ai';
import { createWidgetToken, verifyWidgetToken } from '../lib/widget-jwt.js';
import { handleMessage } from '../orchestration/message-handler.js';
import { extractClientIp } from '../lib/client-ip.js';

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (per IP+slug, 10 req/min)
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string, max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) ?? [];
  // Evict old entries
  const valid = timestamps.filter((t) => now - t < windowMs);
  if (valid.length >= max) {
    rateLimitMap.set(key, valid);
    return true;
  }
  valid.push(now);
  rateLimitMap.set(key, valid);
  return false;
}

// Periodic cleanup (every 5 min) to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap) {
    const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (valid.length === 0) rateLimitMap.delete(key);
    else rateLimitMap.set(key, valid);
  }
}, 5 * 60_000).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/** Deterministic visitor ID from tenant slug + browser fingerprint. */
function makeVisitorId(slug: string, fingerprint: string): string {
  const hash = createHash('sha256')
    .update(slug + fingerprint)
    .digest('hex')
    .slice(0, 16);
  return `visitor_${hash}`;
}

// ---------------------------------------------------------------------------
// Bootstrap RPC — SECURITY DEFINER (bypasses RLS for pre-tenant resolution)
// ---------------------------------------------------------------------------

/**
 * Resolve a tenant by its public slug using the security-definer RPC.
 * This runs as the function owner (postgres), bypassing RLS, because
 * we don't know the tenant_id yet at this point.
 */
async function resolveTenantBySlug(
  slug: string,
): Promise<{ id: string; name: string; default_artifact_id: string } | null> {
  const result = await db.execute(
    sql`SELECT * FROM resolve_tenant_by_slug(${slug})`,
  );
  const row = (result.rows as Array<{ id: string; name: string; default_artifact_id: string | null }>)[0];
  if (!row || !row.default_artifact_id) return null;
  return row as { id: string; name: string; default_artifact_id: string };
}

// ---------------------------------------------------------------------------
// Customer find-or-create
// ---------------------------------------------------------------------------

export async function findOrCreateWebchatCustomer(
  tenantDb: TenantDb,
  tenantId: string,
  visitorId: string,
): Promise<string> {
  return tenantDb.transaction(async (tx) => {
    // Serialize display_name assignment per tenant
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`);

    const rows = await tx
      .insert(customers)
      .values({
        tenantId,
        channel: 'webchat',
        externalId: visitorId,
        name: null,
      })
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.channel, customers.externalId],
        set: { lastSeenAt: new Date() },
      })
      .returning({ id: customers.id, xmax: sql<string>`xmax` });

    const row = rows[0];
    // xmax=0 means fresh INSERT; non-zero means ON CONFLICT DO UPDATE
    const isNewInsert = String(row.xmax) === '0';

    if (isNewInsert) {
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
// Widget routes
// ---------------------------------------------------------------------------

export const widgetRoutes = new Hono();

/**
 * GET /info — Public tenant info for SSR metadata & chat page bootstrap.
 *
 * Query: ?slug=<tenant_slug>
 * Returns: { tenant_name, artifact_name, greeting, language }
 *
 * Security:
 * - Read-only, no session or JWT created
 * - Rate-limited: 10 req/min per IP+slug
 * - Generic error for invalid slug (same 400 as /session)
 *
 * Note: This endpoint intentionally reveals tenant/artifact identity for
 * valid slugs. This is an accepted tradeoff — the public chat page at
 * /chat/[slug] inherently reveals the same information by rendering.
 */
widgetRoutes.get('/info', async (c) => {
  const slug = c.req.query('slug')?.trim();
  if (!slug) {
    return c.json({ error: 'Unable to load chat' }, 400);
  }

  const ip = extractClientIp(c.req.raw);
  if (isRateLimited(`info:${ip}:${slug}`)) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  try {
    const tenant = await resolveTenantBySlug(slug);
    if (!tenant) {
      return c.json({ error: 'Unable to load chat' }, 400);
    }

    const { name: tenantName, default_artifact_id: defaultArtifactId } = tenant;
    const tenantDb = createTenantDb(tenant.id);

    const artifact = await tenantDb.query(async (qdb) => {
      const rows = await qdb
        .select({ name: artifacts.name, personality: artifacts.personality })
        .from(artifacts)
        .where(eq(artifacts.id, defaultArtifactId))
        .limit(1);
      return rows[0];
    });

    if (!artifact) {
      return c.json({ error: 'Unable to load chat' }, 400);
    }

    // Fetch tenant settings for profile data
    const tenantInfo = await tenantDb.query(async (qdb) => {
      const rows = await qdb
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, tenant.id))
        .limit(1);
      return rows[0];
    });

    const personality = artifact.personality as Record<string, unknown> | null;

    // Extract profile from tenant settings
    const settings = tenantInfo?.settings as Record<string, unknown> | null;
    const profile = (settings?.profile as Record<string, unknown>) ?? null;

    // Resolve language: artifact personality > tenant preferredLocale > 'en'
    const preferredLocale = typeof settings?.preferredLocale === 'string'
      ? settings.preferredLocale as string
      : 'en';
    const language = typeof personality?.language === 'string' ? personality.language : preferredLocale;

    // Dynamic greetings: support both string and string[] (random pick)
    const rawGreeting = personality?.greeting;
    let greeting = '';
    if (typeof rawGreeting === 'string') {
      greeting = rawGreeting;
    } else if (Array.isArray(rawGreeting) && rawGreeting.length > 0) {
      const validGreetings = rawGreeting.filter((g): g is string => typeof g === 'string' && g.length > 0);
      greeting = validGreetings.length > 0
        ? validGreetings[Math.floor(Math.random() * validGreetings.length)]
        : '';
    }

    // Resolve quick actions from bound modules (runtime, not stored JSONB)
    const boundModules = await tenantDb.query(async (qdb) =>
      qdb.select({ moduleId: artifactModules.moduleId })
        .from(artifactModules)
        .where(eq(artifactModules.artifactId, defaultArtifactId)),
    );

    let quickActions: Array<{ label: string; message: string }> = [];

    // GUARD: skip modules query if no bindings (support/custom = zero modules)
    if (boundModules.length > 0) {
      // modules table is global catalog (no RLS) — use global db with Drizzle inArray
      const moduleRows = await db
        .select({ slug: modules.slug })
        .from(modules)
        .where(inArray(modules.id, boundModules.map((m) => m.moduleId)));

      // Deterministic order: sort slugs alphabetically so button order is stable
      const slugs = moduleRows.map((r) => r.slug).sort();
      quickActions = getQuickActionsForModules(slugs, language === 'es' ? 'es' : 'en');
    }

    return c.json({
      tenant_name: tenantName,
      artifact_name: artifact.name,
      greeting,
      language,
      profile,
      quick_actions: quickActions,
    });
  } catch (err) {
    console.error('[widget/info] Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /session — Create an anonymous widget session.
 *
 * Input: { tenant_slug, visitor_fingerprint }
 * Returns: { token, tenant_name, artifact_name }
 *
 * Security:
 * - tenant_id resolved server-side from slug via SECURITY DEFINER RPC
 * - Rate-limited: 10 req/min per IP+slug
 * - Generic error message for invalid slug / missing artifact (no enumeration)
 */
widgetRoutes.post('/session', async (c) => {
  let body: { tenant_slug?: string; visitor_fingerprint?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const slug = body.tenant_slug?.trim();
  const fingerprint = body.visitor_fingerprint?.trim();

  if (!slug || !fingerprint) {
    return c.json({ error: 'Unable to create session' }, 400);
  }

  // Rate limit by IP + slug
  const ip = extractClientIp(c.req.raw);
  if (isRateLimited(`${ip}:${slug}`)) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  try {
    // Look up tenant by slug — SECURITY DEFINER RPC (bypasses RLS)
    const tenant = await resolveTenantBySlug(slug);

    // Generic error — don't reveal whether slug exists
    if (!tenant) {
      return c.json({ error: 'Unable to create session' }, 400);
    }

    const { id: tenantId, name: tenantName, default_artifact_id: defaultArtifactId } = tenant;
    const tenantDb = createTenantDb(tenantId);

    // Fetch artifact name + personality (within tenant context — RLS-safe)
    const artifact = await tenantDb.query(async (qdb) => {
      const rows = await qdb
        .select({ name: artifacts.name, personality: artifacts.personality })
        .from(artifacts)
        .where(eq(artifacts.id, defaultArtifactId))
        .limit(1);
      return rows[0];
    });

    if (!artifact) {
      return c.json({ error: 'Unable to create session' }, 400);
    }

    // Create deterministic visitor ID
    const visitorId = makeVisitorId(slug, fingerprint);

    // Find-or-create customer (upsert on tenant + channel + external_id)
    const customerId = await findOrCreateWebchatCustomer(tenantDb, tenantId, visitorId);

    // Create signed JWT with all server-resolved IDs
    const token = await createWidgetToken({
      visitorId,
      tenantId,
      artifactId: defaultArtifactId,
      customerId,
    });

    // Increment sessionInits counter (fire-and-forget, best-effort)
    tenantDb.query(async (qdb) => {
      await qdb.execute(sql`UPDATE tenants SET settings = jsonb_set(
        COALESCE(settings, '{}'), '{sessionInits}',
        to_jsonb(COALESCE(
          CASE WHEN jsonb_typeof(settings->'sessionInits') = 'number'
               THEN (settings->>'sessionInits')::int ELSE 0 END, 0
        ) + 1)
      ) WHERE id = ${tenantId}`);
    }).catch((err) => {
      console.error('[widget/session] sessionInits increment failed:', err);
    });

    // Resolve language: artifact personality > tenant preferredLocale > 'en'
    const personalityLang = (artifact.personality as Record<string, unknown>)?.language;
    let language: string;
    if (typeof personalityLang === 'string') {
      language = personalityLang;
    } else {
      const tenantInfo = await tenantDb.query(async (qdb) => {
        const rows = await qdb
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        return rows[0];
      });
      const tenantSettings = tenantInfo?.settings as Record<string, unknown> | null;
      language = typeof tenantSettings?.preferredLocale === 'string' ? tenantSettings.preferredLocale : 'en';
    }

    return c.json({
      token,
      tenant_name: tenantName,
      artifact_name: artifact.name,
      language,
    });
  } catch (err) {
    console.error('[widget/session] Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /message — Send a message from the widget.
 *
 * Authorization: Bearer <widget JWT>
 * Input: { message, conversation_id? }
 * Returns: AI response
 *
 * Security:
 * - tenant_id, customer_id from verified JWT (never from client)
 * - conversation_id ownership verified server-side before reuse
 */
widgetRoutes.post('/message', async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let claims;
  try {
    claims = await verifyWidgetToken(token);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Per-customer burst rate limit: 20 msgs/min
  if (isRateLimited(`msg:${claims.customer_id}`, 20)) {
    return c.json({ error: 'Too many requests', error_code: 'RATE_LIMITED' }, 429);
  }

  let body: { message?: string; conversation_id?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const messageText = body.message?.trim();
  if (!messageText || messageText.length > 4000) {
    return c.json({ error: 'Message required (1-4000 chars)' }, 400);
  }

  try {
    const tenantDb = createTenantDb(claims.tenant_id);

    // Verify conversation ownership if client provides one
    let existingConversationId: string | undefined;
    if (body.conversation_id) {
      const owned = await tenantDb.query(async (qdb) => {
        const rows = await qdb
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, body.conversation_id!),
              eq(conversations.tenantId, claims.tenant_id),
              eq(conversations.customerId, claims.customer_id),
            ),
          )
          .limit(1);
        return rows[0];
      });

      if (!owned) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      existingConversationId = owned.id;
    }

    const result = await handleMessage({
      tenantDb,
      tenantId: claims.tenant_id,
      channel: 'webchat',
      customerId: claims.customer_id,
      messageText,
      existingConversationId,
    });

    return c.json({
      conversation_id: result.conversationId,
      response_text: result.responseText,
      intent: result.intent,
      model_used: result.modelUsed,
      latency_ms: result.latencyMs,
      budget_exceeded: result.budgetExceeded ?? false,
      conversation_limit_reached: result.conversationLimitReached ?? false,
      daily_limit_reached: result.dailyLimitReached ?? false,
    });
  } catch (err) {
    console.error('[widget/message] Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /history — Fetch conversation history for the widget visitor.
 *
 * Authorization: Bearer <widget JWT>
 * Returns: { messages: [...], conversation_id? }
 *
 * Security:
 * - Only returns messages for the customer_id embedded in the JWT
 * - Never accepts conversationId from client
 */
widgetRoutes.get('/history', async (c) => {
  const token = extractBearerToken(c.req.raw);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  let claims;
  try {
    claims = await verifyWidgetToken(token);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const tenantDb = createTenantDb(claims.tenant_id);

    // Find the visitor's most recent active conversation
    const conversation = await tenantDb.query(async (qdb) => {
      const rows = await qdb
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, claims.tenant_id),
            eq(conversations.customerId, claims.customer_id),
            eq(conversations.channel, 'webchat'),
            sql`${conversations.status} IN ('active', 'escalated')`,
          ),
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(1);
      return rows[0];
    });

    if (!conversation) {
      return c.json({ messages: [], conversation_id: null });
    }

    // Fetch last 50 messages
    const history = await tenantDb.query(async (qdb) => {
      return qdb
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          created_at: messages.createdAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.tenantId, claims.tenant_id),
            sql`${messages.role} IN ('customer', 'artifact', 'human')`,
          ),
        )
        .orderBy(desc(messages.createdAt))
        .limit(50);
    });

    return c.json({
      conversation_id: conversation.id,
      messages: history.reverse(), // chronological order
    });
  } catch (err) {
    console.error('[widget/history] Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
