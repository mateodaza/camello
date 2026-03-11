import { generateText } from 'ai';
import { recordKnowledgeGap } from './knowledge-gap.js';
import { eq, and, sql, desc, asc, isNull, gte, lt } from 'drizzle-orm';
import type { TenantDb } from '@camello/db';
import {
  artifacts,
  conversations,
  messages,
  conversationArtifactAssignments,
  artifactRoutingRules,
  tenants,
  learnings,
  interactionLogs,
  artifactModules,
  modules,
  moduleExecutions,
  leads,
  customers,
  ownerNotifications,
} from '@camello/db';
import {
  classifyIntent,
  selectModel,
  buildSystemPrompt,
  createLLMClient,
  createArtifactResolver,
  searchKnowledge,
  generateEmbedding,
  buildToolsFromBindings,
  checkGroundingWithRetry,
  shouldCheckGrounding,
  SAFE_FALLBACKS,
  getIntentProfile,
  isHighRiskIntent,
  responseContainsClaims,
  flattenRagChunks,
  parseMemoryFacts,
  mergeMemoryFacts,
  parseMemoryTags,
  stripMemoryTags,
  sanitizeFactValue,
  MAX_INJECTED_FACTS,
} from '@camello/ai';
import type { MatchKnowledgeFn, EmbedFn } from '@camello/ai';
import type { ArtifactModuleBinding, Channel, Intent, ModuleDbCallbacks, PlanTier } from '@camello/shared/types';
import { COST_BUDGET_DEFAULTS, LEARNING_CONFIDENCE } from '@camello/shared/constants';
import { t as tmsg } from '@camello/shared/messages';
import { createClient } from '@supabase/supabase-js';
import { buildTelemetry, createTrace } from '../lib/langfuse.js';
import { getUtcMonthWindow } from '../lib/date-utils.js';
import { sendEmail, renderBaseEmail } from '../lib/email.js';

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

// Rate-limit: max 1 approval email per tenant per 5 minutes
const _approvalEmailCooldowns = new Map<string, number>(); // tenantId → epoch ms
const APPROVAL_EMAIL_COOLDOWN_MS = 5 * 60 * 1000;

const _knowledgeGapDigestCooldowns = new Map<string, number>(); // tenantId → epoch ms
const KNOWLEDGE_GAP_DIGEST_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// HTML escaping (for user-controlled fields injected into email body)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Approval email
// ---------------------------------------------------------------------------

interface ApprovalEmailParams {
  tenantId: string;
  ownerEmail: string;
  moduleName: string;
  moduleDescription: string;
  customerName: string;
  inputSummary: string;        // pre-truncated to 200 chars by caller
  conversationId: string;
  dashboardBaseUrl?: string;   // injectable for tests; defaults to env var
}

async function sendApprovalNotificationEmail(params: ApprovalEmailParams): Promise<void> {
  const now = Date.now();
  const lastSent = _approvalEmailCooldowns.get(params.tenantId);
  if (lastSent !== undefined && now - lastSent < APPROVAL_EMAIL_COOLDOWN_MS) {
    console.info(`[handleMessage] Approval email rate-limited for tenant ${params.tenantId}`);
    return;
  }

  // Set cooldown BEFORE the async send to prevent concurrent calls for the same
  // tenant both passing the guard before either writes the timestamp.
  _approvalEmailCooldowns.set(params.tenantId, now);

  const base = params.dashboardBaseUrl ?? process.env.DASHBOARD_URL ?? 'https://app.camello.xyz';
  const ctaUrl = `${base}/dashboard/conversations?selected=${params.conversationId}`;

  // Escape user-controlled fields before embedding in HTML
  const safeCustomerName = escapeHtml(params.customerName);
  const safeInputSummary = escapeHtml(params.inputSummary);

  const html = renderBaseEmail({
    title: `Action needed: ${params.moduleName} approval`,
    body: `<p>Hi,</p>
           <p><strong>${safeCustomerName}</strong> has triggered the <strong>${params.moduleName}</strong> action.</p>
           <p>${params.moduleDescription}</p>
           <p><em>Input summary:</em> ${safeInputSummary}</p>
           <p>Please review and approve or reject this action in the Camello dashboard.</p>`,
    ctaText: 'Review in Camello',
    ctaUrl,
  });

  let result: { sent: boolean };
  try {
    result = await sendEmail({
      to: params.ownerEmail,
      subject: `Action needed: ${params.moduleName} approval`,
      html,
    });
  } catch (err) {
    // sendEmail threw (transport/API exception) — clear cooldown so the next event can retry.
    _approvalEmailCooldowns.delete(params.tenantId);
    throw err;
  }

  if (!result.sent) {
    // Send failed (e.g., missing API key) — clear cooldown so the next event can retry.
    _approvalEmailCooldowns.delete(params.tenantId);
  }
}

// ---------------------------------------------------------------------------
// Knowledge gap digest email
// ---------------------------------------------------------------------------

interface KnowledgeGapDigestParams {
  tenantId: string;
  ownerEmail: string;
  tenantDb: TenantDb;
  dashboardBaseUrl?: string;
}

async function sendKnowledgeGapDigestEmail(params: KnowledgeGapDigestParams): Promise<void> {
  const now = Date.now();
  const lastSent = _knowledgeGapDigestCooldowns.get(params.tenantId);
  if (lastSent !== undefined && now - lastSent < KNOWLEDGE_GAP_DIGEST_COOLDOWN_MS) return;

  // Set cooldown BEFORE the async send to prevent concurrent calls from both passing the guard.
  _knowledgeGapDigestCooldowns.set(params.tenantId, now);

  const windowStart = new Date(now - KNOWLEDGE_GAP_DIGEST_COOLDOWN_MS);
  let gaps: typeof ownerNotifications.$inferSelect[];
  try {
    gaps = await params.tenantDb.query(async (db) =>
      db.select()
        .from(ownerNotifications)
        .where(and(
          eq(ownerNotifications.tenantId, params.tenantId),
          eq(ownerNotifications.type, 'knowledge_gap'),
          gte(ownerNotifications.createdAt, windowStart),
        ))
        .orderBy(desc(ownerNotifications.createdAt)),
    );
  } catch (err) {
    _knowledgeGapDigestCooldowns.delete(params.tenantId);
    throw err;
  }

  if (gaps.length === 0) {
    _knowledgeGapDigestCooldowns.delete(params.tenantId);
    return;
  }

  const base = params.dashboardBaseUrl ?? process.env.DASHBOARD_URL ?? 'https://app.camello.xyz';
  const gapItems = gaps.map((g) => {
    const meta = g.metadata as { intentType?: string; sampleQuestion?: string };
    return `<li><strong>${escapeHtml(meta.intentType ?? 'unknown')}</strong>: "${escapeHtml(meta.sampleQuestion ?? '')}"</li>`;
  }).join('');

  const html = renderBaseEmail({
    title: `Knowledge gaps detected (${gaps.length})`,
    body: `<p>Your agent couldn't answer ${gaps.length} question${gaps.length === 1 ? '' : 's'} in the last 24 hours. Consider adding information to your knowledge base.</p><ul>${gapItems}</ul>`,
    ctaText: 'Add to Knowledge Base',
    ctaUrl: `${base}/dashboard/knowledge`,
  });

  let result: { sent: boolean };
  try {
    result = await sendEmail({
      to: params.ownerEmail,
      subject: `Knowledge gaps: ${gaps.length} unanswered question${gaps.length === 1 ? '' : 's'}`,
      html,
    });
  } catch (err) {
    _knowledgeGapDigestCooldowns.delete(params.tenantId);
    throw err;
  }

  if (!result.sent) {
    _knowledgeGapDigestCooldowns.delete(params.tenantId);
  }
}

export {
  sendApprovalNotificationEmail,
  sendKnowledgeGapDigestEmail,
  _approvalEmailCooldowns as _approvalEmailCooldownsForTest,
  _knowledgeGapDigestCooldowns as _knowledgeGapDigestCooldownsForTest,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandleMessageInput {
  tenantDb: TenantDb;
  tenantId: string;
  channel: Channel;
  customerId: string;
  messageText: string;
  existingConversationId?: string;
  /** Skip artifact resolution — use this artifact directly (sandbox/test mode). */
  artifactId?: string;
  /** Merged into conversation row on creation (e.g. { sandbox: true }). */
  conversationMetadata?: Record<string, unknown>;
}

export interface HandleMessageOutput {
  conversationId: string;
  artifactId: string;
  responseText: string;
  intent: Intent;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
  moduleExecutions: Array<{ moduleSlug: string; status: string }>;
  budgetExceeded?: boolean;
  conversationLimitReached?: boolean;
  dailyLimitReached?: boolean;
  groundingCheck?: {
    passed: boolean;
    violation?: string;
    replacedResponse?: boolean;
    error?: string;
    /** Model used for grounding check (separate from main generation model). */
    groundingModelUsed?: string;
    /** Cost attributed to grounding check alone. */
    groundingCostUsd?: number;
  };
}

// ---------------------------------------------------------------------------
// Main orchestration pipeline
// ---------------------------------------------------------------------------

/**
 * Full message-handling pipeline:
 * 1. Classify intent (regex → LLM fallback)
 * 2. Resolve artifact (existing_conversation → route_rule → default)
 * 3. Find or create conversation
 * 4. Save inbound customer message
 * 5. RAG search (primary + proactive, gated by intent)
 * 6. Fetch learnings for the artifact
 * 7. Build system prompt
 * 8. Select model tier
 * 9. Call LLM
 * 10. Save artifact response message
 * 11. Log interaction telemetry
 * 12. Return response
 */
export async function handleMessage(input: HandleMessageInput): Promise<HandleMessageOutput> {
  const { tenantDb, tenantId, channel, customerId, messageText, existingConversationId, artifactId: overrideArtifactId, conversationMetadata } = input;
  const startTime = Date.now();
  const trace = createTrace({
    tenantId,
    artifactId: 'unknown',
    channel,
    ...(existingConversationId ? { conversationId: existingConversationId } : {}),
  });

  // ── 0. Fetch tenant info (lightweight — needed for budget gate BEFORE paid work) ──
  const tenant = await tenantDb.query(async (db) => {
    const rows = await db
      .select({
        name: tenants.name,
        planTier: tenants.planTier,
        monthlyCostBudgetUsd: tenants.monthlyCostBudgetUsd,
        defaultArtifactId: tenants.defaultArtifactId,
        settings: tenants.settings,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0];
  });

  // ── 0b. Fetch customer memory (lightweight — one DB query, explicit tenant scope) ──
  const customerRow = await tenantDb.query(async (db) => {
    const rows = await db
      .select({ memory: customers.memory, displayName: customers.displayName, name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);
    return rows[0];
  });
  const customerMemory = parseMemoryFacts(customerRow?.memory);
  const customerDisplayName = customerRow?.displayName ?? customerRow?.name ?? 'Customer';

  // ── 1. Cost budget gate (BEFORE any paid work — intent LLM fallback, RAG embeddings) ──
  const planTier = (tenant?.planTier as PlanTier | undefined) ?? 'starter';
  const effectiveBudget = resolveEffectiveMonthlyBudget(planTier, tenant?.monthlyCostBudgetUsd);
  const { monthStart, nextMonthStart } = getUtcMonthWindow(new Date());

  const monthCost = await trace.span('cost-budget-check', async () => {
    const rows = await tenantDb.query(async (db) => {
      return db
        .select({ totalCost: sql<string>`coalesce(sum(cost_usd), 0)` })
        .from(interactionLogs)
        .where(
          and(
            eq(interactionLogs.tenantId, tenantId),
            gte(interactionLogs.createdAt, monthStart),
            lt(interactionLogs.createdAt, nextMonthStart),
          ),
        );
    });
    return parseFloat(rows[0]?.totalCost ?? '0');
  });

  if (isBudgetExceeded(monthCost, effectiveBudget)) {
    const tenantLocale = (tenant?.settings as Record<string, unknown>)?.preferredLocale;
    return handleBudgetExceeded({
      tenantDb, tenantId, channel, customerId, messageText,
      existingConversationId, tenant, trace, startTime,
      locale: typeof tenantLocale === 'string' ? tenantLocale : undefined,
    });
  }

  // ── 1b. Daily customer ceiling (100 msgs/day) — before any paid LLM work ──
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const dailyCount = await tenantDb.query(async (db) => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.customerId, customerId),
          eq(conversations.tenantId, tenantId),
          eq(messages.role, 'customer'),
          gte(messages.createdAt, todayStart),
        ),
      );
    return row.count;
  });

  if (dailyCount >= 100) {
    return handleDailyLimitReached({
      tenantDb, tenantId, channel, customerId, messageText,
      existingConversationId, tenant, trace, startTime,
    });
  }

  // ── 1c. Conversation cap phase A (50 msgs) — when existingConversationId provided ──
  if (existingConversationId) {
    const convMsgCount = await tenantDb.query(async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.id, existingConversationId),
            eq(conversations.tenantId, tenantId),
            eq(conversations.customerId, customerId),
          ),
        );
      return row.count;
    });

    if (convMsgCount >= 50) {
      return handleConversationLimitReached({
        tenantDb, tenantId, channel, customerId, messageText,
        existingConversationId, tenant, trace, startTime,
      });
    }
  }

  // ── 2. Resolve override artifact BEFORE paid work (caller already validated existence) ──
  let resolved: { artifactId: string; conversationId?: string; isNewConversation: boolean; source: string } | null = null;

  if (overrideArtifactId) {
    // Check if we can reuse the existing conversation
    let canReuse = false;
    if (existingConversationId) {
      const existing = await tenantDb.query(async (db) => {
        const rows = await db
          .select({
            id: conversations.id,
            metadata: conversations.metadata,
            assignedArtifactId: conversationArtifactAssignments.artifactId,
          })
          .from(conversations)
          .innerJoin(
            conversationArtifactAssignments,
            and(
              eq(conversationArtifactAssignments.conversationId, conversations.id),
              eq(conversationArtifactAssignments.isActive, true),
              isNull(conversationArtifactAssignments.endedAt),
            ),
          )
          .where(
            and(
              eq(conversations.id, existingConversationId),
              eq(conversations.tenantId, tenantId),
              eq(conversations.customerId, customerId),
              eq(conversations.status, 'active'),
            ),
          )
          .limit(1);
        return rows[0] ?? null;
      });

      // Reuse only if: owned, active, same artifact, and already sandbox
      if (
        existing &&
        existing.assignedArtifactId === overrideArtifactId &&
        (existing.metadata as Record<string, unknown> | null)?.sandbox === true
      ) {
        canReuse = true;
      }
    }

    resolved = {
      artifactId: overrideArtifactId,
      conversationId: canReuse ? existingConversationId : undefined,
      isNewConversation: !canReuse,
      source: 'manual_override',
    };
    trace.setMetadata({ artifactId: resolved.artifactId });
  }

  // ── 3. Classify intent (first potentially paid step — LLM fallback) ──
  const intent = await trace.span('classify-intent', () => classifyIntent(messageText));

  // 4. Resolve artifact via normal resolver (only when no override)
  if (!resolved) {
    const resolver = createArtifactResolver({
      findActiveConversation: (custId) => findActiveConversation(tenantDb, custId),
      findMatchingRule: (ch, intentType, confidence) =>
        findMatchingRule(tenantDb, ch, intentType, confidence),
      getDefaultArtifact: () => getDefaultArtifact(tenantDb, tenantId),
    });

    resolved = await trace.span('artifact-resolver', () =>
      resolver.resolve({
        tenantId,
        channel,
        customerId,
        intent,
        existingConversationId,
        isReturningCustomer: false, // TODO: derive from customer record
      }),
    );
    trace.setMetadata({ artifactId: resolved.artifactId });
  }

  // 4. Find or create conversation
  const conversationId = await findOrCreateConversation(
    tenantDb,
    tenantId,
    resolved,
    customerId,
    channel,
    conversationMetadata,
  );
  trace.setMetadata({ conversationId });

  // 4b. Conversation cap phase B — for resolver-found conversations (WhatsApp path)
  // Skip if we already checked this conversation in step 1c
  if (!existingConversationId || conversationId !== existingConversationId) {
    const convMsgCountB = await tenantDb.query(async (db) => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      return row.count;
    });

    if (convMsgCountB >= 50) {
      return handleConversationLimitReached({
        tenantDb, tenantId, channel, customerId, messageText,
        existingConversationId: conversationId, tenant, trace, startTime,
      });
    }
  }

  // 5. Save inbound customer message (capture ID for tool idempotency)
  const triggerMessageId = await tenantDb.query(async (db) => {
    const [row] = await db.insert(messages).values({
      tenantId,
      conversationId,
      role: 'customer',
      content: messageText,
    }).returning({ id: messages.id });
    return row.id;
  });

  // 6. Load artifact config
  const artifact = await tenantDb.query(async (db) => {
    const rows = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, resolved.artifactId))
      .limit(1);
    return rows[0];
  });

  // 6b. Fetch artifact module bindings
  const boundModules: ArtifactModuleBinding[] = await tenantDb.query(async (db) => {
    const rows = await db
      .select({
        moduleSlug: modules.slug,
        moduleId: modules.id,
        moduleName: modules.name,
        moduleDescription: modules.description,
        autonomyLevel: artifactModules.autonomyLevel,
        configOverrides: artifactModules.configOverrides,
        inputSchema: modules.inputSchema,
      })
      .from(artifactModules)
      .innerJoin(modules, eq(modules.id, artifactModules.moduleId))
      .where(eq(artifactModules.artifactId, resolved.artifactId));
    return rows.map((r) => ({
      ...r,
      configOverrides: r.configOverrides as Record<string, unknown>,
      inputSchema: r.inputSchema as unknown,
    }));
  });

  // 6b-1. Enrich book_meeting bindings with businessHours from artifact.personality.hours
  const artifactHours =
    (artifact.personality as Record<string, unknown>)?.hours as string | undefined;

  const enrichedModules: ArtifactModuleBinding[] = artifactHours
    ? boundModules.map((m) =>
        m.moduleSlug === 'book_meeting'
          ? { ...m, configOverrides: { ...m.configOverrides, businessHours: artifactHours } }
          : m,
      )
    : boundModules;

  // 6c. Build module DB callbacks (DI — keeps @camello/ai free of @camello/db)
  const moduleDbCallbacks: ModuleDbCallbacks = {
    insertLead: async (data) => {
      return tenantDb.query(async (db) => {
        const { estimatedValue, sourceChannel, sourcePage, ...rest } = data;
        const numericValue = estimatedValue != null ? String(estimatedValue) : null;
        // Upsert: idx_leads_conversation_unique enforces one lead per conversation.
        // Re-qualification enriches the existing row. qualifiedAt is NOT updated —
        // it records the original qualification timestamp.
        const [row] = await db
          .insert(leads)
          .values({ ...rest, estimatedValue: numericValue, sourceChannel, sourcePage })
          .onConflictDoUpdate({
            target: leads.conversationId,
            targetWhere: sql`conversation_id IS NOT NULL`,
            set: {
              score: rest.score,
              stage: rest.stage ?? 'new',
              estimatedValue: numericValue,
              tags: rest.tags,
              budget: rest.budget ?? null,
              timeline: rest.timeline ?? null,
              summary: rest.summary ?? null,
              updatedAt: new Date(),
              // sourceChannel + sourcePage intentionally omitted: first-write-wins
            },
          })
          .returning({ id: leads.id });
        return row.id;
      });
    },
    insertModuleExecution: async (data) => {
      return tenantDb.query(async (db) => {
        const [row] = await db.insert(moduleExecutions).values(data).returning({ id: moduleExecutions.id });
        return row.id;
      });
    },
    updateModuleExecution: async (id, data) => {
      await tenantDb.query(async (db) => {
        await db
          .update(moduleExecutions)
          .set(data)
          .where(eq(moduleExecutions.id, id));
      });
    },
    updateConversationStatus: async (convId, status) => {
      await tenantDb.query(async (db) => {
        await db
          .update(conversations)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(conversations.id, convId), eq(conversations.tenantId, tenantId)));
      });
    },
    insertOwnerNotification: async (data) => {
      await tenantDb.query(async (db) => {
        await db.insert(ownerNotifications).values(data);
      });
    },
    getLeadByConversation: async (convId) => {
      const [row] = await tenantDb.query(async (db) =>
        db.select({ stage: leads.stage })
          .from(leads)
          .where(eq(leads.conversationId, convId))
          .limit(1),
      );
      return row ?? null;
    },
    checkModuleExecutionExists: async (convId, moduleSlug) => {
      const [row] = await tenantDb.query(async (db) =>
        db.select({ id: moduleExecutions.id })
          .from(moduleExecutions)
          .where(
            and(
              eq(moduleExecutions.conversationId, convId),
              eq(moduleExecutions.moduleSlug, moduleSlug),
            ),
          )
          .limit(1),
      );
      return row != null;
    },
    checkQueuedFollowupExists: async (convId) => {
      const rows = await tenantDb.query(async (db) =>
        db.select({ output: moduleExecutions.output })
          .from(moduleExecutions)
          .where(
            and(
              eq(moduleExecutions.conversationId, convId),
              eq(moduleExecutions.moduleSlug, 'send_followup'),
              eq(moduleExecutions.status, 'executed'),
            ),
          ),
      );
      return rows.some(
        (r) =>
          r.output != null &&
          (r.output as Record<string, unknown>).followup_status === 'queued',
      );
    },
    scheduleFollowupExecution: async (data) => {
      await tenantDb.query(async (db) => {
        const [modRow] = await db
          .select({ id: modules.id })
          .from(modules)
          .where(eq(modules.slug, 'send_followup'))
          .limit(1);
        if (!modRow) return; // module not seeded yet — skip silently
        // ON CONFLICT DO NOTHING: if a concurrent qualify_lead already inserted a
        // queued row (race condition), the unique partial index prevents duplicates.
        await db.insert(moduleExecutions).values({
          moduleId: modRow.id,
          moduleSlug: 'send_followup',
          artifactId: data.artifactId,
          tenantId: data.tenantId,
          conversationId: data.conversationId,
          input: { message_template: 'gentle_reminder' },
          output: {
            followup_status: 'queued',
            scheduled_at: data.scheduledAt.toISOString(),
            channel: 'pending',
            followup_number: 1,
          },
          status: 'executed',
          durationMs: 0,
        }).onConflictDoNothing();
      });
    },
  };

  // 6d. Build approval notifier (non-blocking — guardrail #4)
  function buildApprovalBody(moduleSlug: string, input: unknown): string {
    const i = (input ?? {}) as Record<string, unknown>;
    if (moduleSlug === 'send_quote') {
      const total = i.total ?? i.amount;
      const currency = (i.currency as string | undefined) ?? '';
      if (total) return `Send quote: ${[currency, String(total)].filter(Boolean).join(' ')}`;
    }
    if (moduleSlug === 'collect_payment') {
      const amount = i.amount;
      const currency = (i.currency as string | undefined) ?? '';
      if (amount) return `Collect payment: ${[currency, String(amount)].filter(Boolean).join(' ')}`;
    }
    if (moduleSlug === 'book_meeting') return 'Schedule a meeting with this lead';
    return `Action: ${moduleSlug.replace(/_/g, ' ')}`;
  }

  const onApprovalNeeded = async (executionId: string, moduleSlug: string, input: unknown) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await supabase.channel(`tenant:${tenantId}:approvals`).send({
      type: 'broadcast',
      event: 'approval_needed',
      payload: { executionId, moduleSlug, input, conversationId, artifactId: resolved.artifactId },
    });

    // Persist owner notification + send email after successful insert (non-blocking)
    tenantDb.query(async (db) => {
      await db.insert(ownerNotifications).values({
        tenantId,
        artifactId: resolved.artifactId,
        type: 'approval_needed',
        title: `Approval needed: ${moduleSlug.replace(/_/g, ' ')}`,
        body: buildApprovalBody(moduleSlug, input),
        metadata: {
          conversationId,
          executionId,
          moduleSlug,
        },
      });

      // Send approval email only after insert succeeds (fire-and-forget within callback)
      const ownerEmail = (tenant?.settings as Record<string, unknown>)?.ownerEmail;
      if (typeof ownerEmail === 'string' && ownerEmail) {
        const moduleMeta = enrichedModules.find((m) => m.moduleSlug === moduleSlug);
        sendApprovalNotificationEmail({
          tenantId,
          ownerEmail,
          moduleName: moduleMeta?.moduleName ?? moduleSlug.replace(/_/g, ' '),
          moduleDescription: moduleMeta?.moduleDescription ?? '',
          customerName: customerDisplayName,
          inputSummary: JSON.stringify(input ?? {}).slice(0, 200),
          conversationId,
        }).catch((err: unknown) => {
          console.warn('[handleMessage] Approval email failed:', err instanceof Error ? err.message : String(err));
        });
      } else {
        console.warn(`[handleMessage] ownerEmail missing for tenant ${tenantId} — skipping approval email`);
      }
    }).catch((err: unknown) => {
      console.warn('[handleMessage] approval_needed notification failed:', err instanceof Error ? err.message : String(err));
    });
  };

  // 7. RAG search
  const embed: EmbedFn = generateEmbedding;
  const matchKnowledge: MatchKnowledgeFn = (params) =>
    tenantDb.query(async (db) => {
      // Format embedding as vector literal and docTypes as Postgres array
      // literal — Drizzle parameterized JS arrays are sent as 'record' type
      // which Postgres can't cast to vector or text[].
      const vecLiteral = `[${params.queryEmbedding.join(',')}]`;
      const docTypesLiteral = params.docTypes
        ? `{${params.docTypes.map((t) => `"${t}"`).join(',')}}`
        : null;
      const rows = await db.execute(sql`
        SELECT * FROM match_knowledge(
          ${vecLiteral}::vector,
          ${params.queryText},
          ${params.tenantId}::uuid,
          ${docTypesLiteral}::text[],
          ${params.similarityThreshold},
          ${params.matchCount}
        )
      `);
      return rows.rows as any[];
    });

  const ragResult = await trace.span('rag-search', () =>
    searchKnowledge({
      queryText: messageText,
      intent,
      tenantId,
      embed,
      matchKnowledge,
      archetypeType: artifact.type as import('@camello/shared/types').ArtifactType,
    }),
  );

  // 7b. Fire-and-forget: record knowledge gap when RAG returns empty for non-trivial intent
  const isEmptyRag =
    !ragResult.searchSkipped &&
    ragResult.directContext.length === 0 &&
    (ragResult.proactiveContext ?? []).length === 0;
  if (isEmptyRag) {
    const ownerEmail = (tenant?.settings as Record<string, unknown>)?.ownerEmail;
    recordKnowledgeGap(tenantDb, tenantId, resolved.artifactId, intent.type, messageText)
      .then((inserted) => {
        if (inserted && typeof ownerEmail === 'string' && ownerEmail) {
          void sendKnowledgeGapDigestEmail({ tenantId, ownerEmail, tenantDb }).catch((err: unknown) => {
            console.warn('[handleMessage] Knowledge gap digest email failed:', err instanceof Error ? err.message : String(err));
          });
        }
      })
      .catch((err: unknown) => {
        // Belt-and-suspenders: recordKnowledgeGap catches internally and never rejects.
        console.warn('[handleMessage] Knowledge gap recording failed (non-blocking):', err instanceof Error ? err.message : String(err));
      });
  }

  // 8. Fetch learnings for this artifact
  const artifactLearnings = await tenantDb.query(async (db) => {
    return db
      .select({ content: learnings.content })
      .from(learnings)
      .where(
        and(
          eq(learnings.tenantId, tenantId),
          eq(learnings.artifactId, resolved.artifactId),
          sql`${learnings.confidence}::numeric >= ${LEARNING_CONFIDENCE.retrieval_floor}`,
        ),
      )
      .orderBy(desc(learnings.confidence))
      .limit(10);
  });

  // 9. Build system prompt (intent-aware context curation)
  // Artifact-level language takes priority; fall back to tenant's dashboard locale
  // so existing artifacts without personality.language still get the right templates.
  const artifactLocale =
    ((artifact.personality as Record<string, unknown>)?.language as string | undefined)
    ?? ((tenant?.settings as Record<string, unknown>)?.preferredLocale as string | undefined);
  const intentProfile = getIntentProfile(intent);
  const systemPrompt = buildSystemPrompt({
    artifact: {
      name: artifact.name,
      role: artifact.type,
      type: artifact.type,
      personality: artifact.personality as Record<string, unknown>,
      constraints: artifact.constraints as Record<string, unknown>,
      config: artifact.config as Record<string, unknown>,
      companyName: tenant?.name ?? 'our company',
    },
    channel,
    ragContext: ragResult.directContext,
    proactiveContext: ragResult.proactiveContext,
    learnings: artifactLearnings.map((l) => l.content),
    modules: enrichedModules.map((m) => ({
      name: m.moduleName,
      slug: m.moduleSlug,
      description: m.moduleDescription,
      autonomyLevel: m.autonomyLevel,
    })),
    locale: artifactLocale,
    ragSearchAttempted: !ragResult.searchSkipped,
    customerMemory: customerMemory.slice(0, MAX_INJECTED_FACTS).map((f) => ({
      key: f.key,
      value: sanitizeFactValue(f.value),
    })),
    intent,
  });

  // 10. Select model
  const { model: modelId } = selectModel(intent);

  // 11. Fetch recent conversation history for context
  const history = await tenantDb.query(async (db) => {
    return db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.tenantId, tenantId),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(20);
  });

  // Build messages array (reverse to chronological, current message already saved)
  // Filter out 'system' role messages — they are internal notes, not conversation turns.
  // 'human' role = human agent who took over → maps to 'assistant' (same side as artifact).
  const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = history
    .reverse()
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'customer' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

  // 12. Build tools (intent-profile-gated) and call LLM
  const client = createLLMClient();
  // Only build tools when the intent profile allows modules
  const filteredModules = intentProfile.includeModules
    ? (intentProfile.allowedModuleSlugs
        ? enrichedModules.filter((m) => intentProfile.allowedModuleSlugs!.includes(m.moduleSlug))
        : enrichedModules)
    : [];
  const tools = filteredModules.length > 0
    ? buildToolsFromBindings(filteredModules, {
        tenantId,
        artifactId: resolved.artifactId,
        conversationId,
        customerId,
        triggerMessageId,
        db: moduleDbCallbacks,
        onApprovalNeeded,
        channel,
        metadata: conversationMetadata
          ? { sourcePage: conversationMetadata.sourcePage }
          : undefined,
      })
    : undefined;

  const { text: rawResponseText, usage, steps } = await generateText({
    model: client(modelId),
    system: systemPrompt,
    messages: chatMessages,
    tools,
    maxSteps: tools ? intentProfile.maxSteps : 1,
    maxTokens: intentProfile.maxResponseTokens,
    experimental_telemetry: buildTelemetry('handle-message', {
      traceId: trace.traceId,
      tenantId,
      artifactId: resolved.artifactId,
      conversationId,
      channel,
      intent: intent.type,
      model: modelId,
    }),
  });

  const mainTokensIn = usage?.promptTokens ?? 0;
  const mainTokensOut = usage?.completionTokens ?? 0;
  const mainCostUsd = estimateCost(modelId, mainTokensIn, mainTokensOut);

  // Extract module execution summaries from tool call steps
  const executedModules: Array<{ moduleSlug: string; status: string }> = [];
  for (const step of steps ?? []) {
    if (step.toolCalls) {
      for (const tc of step.toolCalls) {
        executedModules.push({ moduleSlug: tc.toolName, status: 'invoked' });
      }
    }
  }

  // 12b. Post-generation grounding check
  // Fail-closed for high-risk intents OR when response contains specific claims.
  // Fail-open for low-risk intents (greetings, farewells, general conversation).
  let responseText = rawResponseText;
  let groundingResult: HandleMessageOutput['groundingCheck'] | undefined;
  let groundingCostUsd = 0;
  let groundingTokensIn = 0;
  let groundingTokensOut = 0;

  const allRagEvidence = flattenRagChunks([...ragResult.directContext, ...(ragResult.proactiveContext ?? [])]);
  if (shouldCheckGrounding(intent, allRagEvidence)) {
    try {
      const check = await trace.span('grounding-check', () =>
        checkGroundingWithRetry({
          responseText: rawResponseText,
          ragContext: allRagEvidence,
          intent,
          locale: artifactLocale,
        }),
      );
      groundingTokensIn = check.tokensIn;
      groundingTokensOut = check.tokensOut;
      groundingCostUsd = estimateCost(check.modelUsed, check.tokensIn, check.tokensOut);
      groundingResult = {
        passed: check.passed,
        violation: check.violation,
        replacedResponse: !check.passed,
        groundingModelUsed: check.modelUsed,
        groundingCostUsd,
      };
      if (!check.passed && check.safeResponse) responseText = check.safeResponse;
    } catch (err) {
      const errMsg = String(err).slice(0, 200);
      // Claim-sensitive fail-closed: if the intent is high-risk OR the response
      // contains specific factual claims (prices, plan names, etc.), replace with
      // safe fallback rather than letting an unchecked response through.
      const needsFailClosed = isHighRiskIntent(intent.type) || responseContainsClaims(rawResponseText);
      if (needsFailClosed) {
        const fallbackLocale = (artifactLocale && SAFE_FALLBACKS[artifactLocale]) ? artifactLocale : 'en';
        responseText = SAFE_FALLBACKS[fallbackLocale];
        groundingResult = { passed: false, violation: 'grounding_check_error', replacedResponse: true, error: errMsg };
      } else {
        // Fail-open for low-risk intents without claims
        groundingResult = { passed: true, violation: undefined, replacedResponse: false, error: errMsg };
      }
    }
  }

  // 12c. Parse + strip LLM memory tags from response (before saving)
  const memoryTagFacts = parseMemoryTags(responseText, conversationId);
  if (memoryTagFacts.length > 0) {
    responseText = stripMemoryTags(responseText);
  }

  // Totals (main + grounding for persisted metrics)
  const latencyMs = Date.now() - startTime;
  const tokensIn = mainTokensIn + groundingTokensIn;
  const tokensOut = mainTokensOut + groundingTokensOut;
  const costUsd = mainCostUsd + groundingCostUsd;

  // 13. Save artifact response
  // NOTE: modelUsed = main generation model. costUsd includes grounding overhead.
  // Per-model breakdown available in groundingCheck output + Langfuse span.
  await tenantDb.query(async (db) => {
    await db.insert(messages).values({
      tenantId,
      conversationId,
      role: 'artifact',
      content: responseText,
      tokensUsed: tokensIn + tokensOut,
      modelUsed: modelId,
      costUsd: costUsd.toFixed(6),
    });
  });

  // 14. Log interaction telemetry (includes context curation decisions)
  const curationTelemetry = {
    profileKey: intent.type === 'greeting' ? `greeting:${intent.source}` : intent.type,
    toolsExposed: filteredModules.map((m) => m.moduleSlug),
    frameworkIncluded: intentProfile.includeArchetypeFramework,
    maxTokens: intentProfile.maxResponseTokens,
    maxSteps: intentProfile.maxSteps,
    groundingMode: intentProfile.skipGrounding ? 'skipped' : (isHighRiskIntent(intent.type) ? 'fail-closed' : 'fail-open'),
    failClosedTriggered: groundingResult?.replacedResponse === true && groundingResult?.violation === 'grounding_check_error',
  };
  await tenantDb.query(async (db) => {
    await db.insert(interactionLogs).values({
      tenantId,
      artifactId: resolved.artifactId,
      conversationId,
      intent: intent.type,
      modelUsed: modelId,
      tokensIn,
      tokensOut,
      costUsd: costUsd.toFixed(6),
      latencyMs,
      contextCuration: curationTelemetry,
    });
  });

  // 15. Update conversation timestamp
  await tenantDb.query(async (db) => {
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  });

  // 16. Fire-and-forget: persist LLM-extracted memory tags + sync name
  if (memoryTagFacts.length > 0) {
    setImmediate(async () => {
      try {
        const custRow = await tenantDb.query(async (db) => {
          const rows = await db
            .select({ memory: customers.memory, name: customers.name, email: customers.email, phone: customers.phone })
            .from(customers)
            .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
            .limit(1);
          return rows[0];
        });

        const merged = mergeMemoryFacts(parseMemoryFacts(custRow?.memory), memoryTagFacts);
        const memoryPayload = JSON.stringify({ facts: merged, updatedAt: new Date().toISOString() });

        // Sync extracted facts to top-level columns (only if column is currently empty)
        const syncFields: Record<string, string> = {};
        const nameFact = merged.find((f) => f.key === 'name');
        if (nameFact && !custRow?.name) syncFields.name = nameFact.value;
        const emailFact = merged.find((f) => f.key === 'email');
        if (emailFact && !custRow?.email) syncFields.email = emailFact.value;
        const phoneFact = merged.find((f) => f.key === 'phone');
        if (phoneFact && !custRow?.phone) syncFields.phone = phoneFact.value;

        await tenantDb.query(async (db) => {
          await db
            .update(customers)
            .set({
              memory: sql`${memoryPayload}::jsonb`,
              ...syncFields,
            })
            .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
        });
      } catch (err) {
        console.error('[customer-memory] tag persistence failed (non-blocking):', err);
      }
    });
  }

  trace.setMetadata({ contextCuration: JSON.stringify(curationTelemetry) });
  trace.finalize({
    modelUsed: modelId,
    costUsd,
    tokensIn,
    tokensOut,
    latencyMs,
  });

  return {
    conversationId,
    artifactId: resolved.artifactId,
    responseText,
    intent,
    modelUsed: modelId,
    tokensIn,
    tokensOut,
    costUsd,
    latencyMs,
    moduleExecutions: executedModules,
    groundingCheck: groundingResult,
  };
}

// ---------------------------------------------------------------------------
// DB callback helpers for artifact resolver
// ---------------------------------------------------------------------------

async function findActiveConversation(
  tenantDb: TenantDb,
  customerId: string,
) {
  return tenantDb.query(async (db) => {
    const rows = await db
      .select({
        artifactId: conversationArtifactAssignments.artifactId,
        artifactName: artifacts.name,
        artifactType: artifacts.type,
        conversationId: conversations.id,
      })
      .from(conversations)
      .innerJoin(
        conversationArtifactAssignments,
        and(
          eq(conversationArtifactAssignments.conversationId, conversations.id),
          eq(conversationArtifactAssignments.isActive, true),
          isNull(conversationArtifactAssignments.endedAt),
        ),
      )
      .innerJoin(artifacts, eq(artifacts.id, conversationArtifactAssignments.artifactId))
      .where(
        and(
          eq(conversations.customerId, customerId),
          eq(conversations.status, 'active'),
          eq(artifacts.isActive, true),
        ),
      )
      .orderBy(desc(conversations.updatedAt))
      .limit(1);

    return rows[0] ?? null;
  });
}

async function findMatchingRule(
  tenantDb: TenantDb,
  channel: Channel,
  intentType: string,
  confidence: number,
) {
  return tenantDb.query(async (db) => {
    const rows = await db
      .select({
        artifactId: artifactRoutingRules.artifactId,
        artifactName: artifacts.name,
        artifactType: artifacts.type,
      })
      .from(artifactRoutingRules)
      .innerJoin(artifacts, eq(artifacts.id, artifactRoutingRules.artifactId))
      .where(
        and(
          eq(artifactRoutingRules.isActive, true),
          eq(artifacts.isActive, true),
          sql`(${artifactRoutingRules.channel} IS NULL OR ${artifactRoutingRules.channel} = ${channel})`,
          sql`(${artifactRoutingRules.intent} IS NULL OR ${artifactRoutingRules.intent} = ${intentType})`,
          sql`${artifactRoutingRules.minConfidence}::numeric <= ${confidence}`,
        ),
      )
      .orderBy(asc(artifactRoutingRules.priority))
      .limit(1);

    return rows[0] ?? null;
  });
}

async function getDefaultArtifact(
  tenantDb: TenantDb,
  tenantId: string,
) {
  return tenantDb.query(async (db) => {
    // First: tenant's default artifact
    const tenant = await db
      .select({ defaultArtifactId: tenants.defaultArtifactId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant[0]?.defaultArtifactId) {
      const rows = await db
        .select({
          artifactId: artifacts.id,
          artifactName: artifacts.name,
          artifactType: artifacts.type,
        })
        .from(artifacts)
        .where(and(eq(artifacts.id, tenant[0].defaultArtifactId), eq(artifacts.isActive, true)))
        .limit(1);

      if (rows[0]) return rows[0];
    }

    // Fallback: first active artifact by creation order
    const rows = await db
      .select({
        artifactId: artifacts.id,
        artifactName: artifacts.name,
        artifactType: artifacts.type,
      })
      .from(artifacts)
      .where(and(eq(artifacts.tenantId, tenantId), eq(artifacts.isActive, true)))
      .orderBy(asc(artifacts.createdAt))
      .limit(1);

    return rows[0] ?? null;
  });
}

// ---------------------------------------------------------------------------
// Conversation find-or-create
// ---------------------------------------------------------------------------

async function findOrCreateConversation(
  tenantDb: TenantDb,
  tenantId: string,
  resolved: { artifactId: string; conversationId?: string; isNewConversation: boolean; source: string },
  customerId: string,
  channel: Channel,
  metadata?: Record<string, unknown>,
): Promise<string> {
  // Reuse existing conversation
  if (resolved.conversationId && !resolved.isNewConversation) {
    return resolved.conversationId;
  }

  // Create new conversation + assignment in a transaction
  return tenantDb.transaction(async (tx) => {
    const [conv] = await tx
      .insert(conversations)
      .values({
        tenantId,
        artifactId: resolved.artifactId,
        customerId,
        channel,
        status: 'active',
        ...(metadata ? { metadata } : {}),
      })
      .returning({ id: conversations.id });

    // Record the artifact assignment
    const assignmentReason = resolved.source === 'manual_override'
      ? 'manual_override' as const
      : resolved.source === 'existing_conversation'
        ? 'route_rule' as const
        : resolved.source as 'route_rule' | 'tenant_default_fallback';

    await tx.insert(conversationArtifactAssignments).values({
      tenantId,
      conversationId: conv.id,
      artifactId: resolved.artifactId,
      assignmentReason,
    });

    return conv.id;
  });
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/** Rough cost estimate per 1K tokens. Actual billing uses OpenRouter callbacks. */
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-001': { input: 0.0001, output: 0.0004 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
};

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COST_PER_1K[model] ?? { input: 0.001, output: 0.002 };
  return (tokensIn / 1000) * rates.input + (tokensOut / 1000) * rates.output;
}

// Re-export from shared util for backward compat (tests import from here)
export { getUtcMonthWindow } from '../lib/date-utils.js';

export function resolveEffectiveMonthlyBudget(
  planTier: PlanTier,
  tenantBudgetRaw: string | number | null | undefined,
): number {
  if (tenantBudgetRaw == null) return COST_BUDGET_DEFAULTS[planTier];
  const parsed = Number(tenantBudgetRaw);
  return Number.isFinite(parsed) ? parsed : COST_BUDGET_DEFAULTS[planTier];
}

export function isBudgetExceeded(currentMonthCost: number, effectiveBudget: number): boolean {
  return currentMonthCost >= effectiveBudget;
}

// ---------------------------------------------------------------------------
// Budget-exceeded early return
// ---------------------------------------------------------------------------

/** @deprecated Use tmsg('error.budgetExceeded', locale) instead for locale-aware messages. Kept for backward compat in tests. */
export const BUDGET_EXCEEDED_RESPONSE = 'Your AI team has reached its monthly usage limit. Please upgrade your plan or contact support.';

export interface BudgetExceededInput {
  tenantDb: TenantDb;
  tenantId: string;
  channel: Channel;
  customerId: string;
  messageText: string;
  existingConversationId?: string;
  tenant: { name: string; defaultArtifactId: string | null } | undefined;
  trace: ReturnType<typeof createTrace>;
  startTime: number;
  locale?: string;
}

export async function handleBudgetExceeded(input: BudgetExceededInput): Promise<HandleMessageOutput> {
  const { tenantDb, tenantId, channel, customerId, messageText, existingConversationId, tenant, trace, startTime, locale } = input;
  const budgetResponse = tmsg('error.budgetExceeded', locale);
  const budgetIntent: Intent = { type: 'general_inquiry', confidence: 0, complexity: 'simple', requires_knowledge_base: false, sentiment: 'neutral', source: 'regex' };

  // ── Resolve artifact + validate conversation ownership ──
  let conversationId: string | undefined;
  let artifactId: string | null = null;

  if (existingConversationId) {
    // Validate the conversation belongs to this customer AND is active
    const owned = await tenantDb.query(async (db) => {
      const rows = await db
        .select({
          id: conversations.id,
          artifactId: conversationArtifactAssignments.artifactId,
        })
        .from(conversations)
        .innerJoin(
          conversationArtifactAssignments,
          and(
            eq(conversationArtifactAssignments.conversationId, conversations.id),
            eq(conversationArtifactAssignments.isActive, true),
            isNull(conversationArtifactAssignments.endedAt),
          ),
        )
        .where(
          and(
            eq(conversations.id, existingConversationId),
            eq(conversations.customerId, customerId),
            eq(conversations.tenantId, tenantId),
            eq(conversations.status, 'active'),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    if (owned) {
      conversationId = owned.id;
      artifactId = owned.artifactId;
    }
    // If ownership check fails, fall through to create a new conversation
  }

  // Fallback: resolve artifact from tenant default or first active
  if (!artifactId) {
    artifactId = tenant?.defaultArtifactId ?? null;

    // Verify the default artifact is actually active
    if (artifactId) {
      const active = await tenantDb.query(async (db) => {
        const rows = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(and(eq(artifacts.id, artifactId!), eq(artifacts.isActive, true)))
          .limit(1);
        return rows[0] ?? null;
      });
      if (!active) artifactId = null;
    }

    if (!artifactId) {
      const fallback = await tenantDb.query(async (db) => {
        const rows = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(and(eq(artifacts.tenantId, tenantId), eq(artifacts.isActive, true)))
          .orderBy(asc(artifacts.createdAt))
          .limit(1);
        return rows[0] ?? null;
      });
      artifactId = fallback?.id ?? null;
    }
  }

  // ── No active artifact at all — skip DB writes to avoid FK violation ──
  if (!artifactId) {
    const latencyMs = Date.now() - startTime;
    trace.finalize({ modelUsed: 'budget_exceeded', costUsd: 0, tokensIn: 0, tokensOut: 0, latencyMs });
    return {
      conversationId: '',
      artifactId: '',
      responseText: budgetResponse,
      intent: budgetIntent,
      modelUsed: 'budget_exceeded',
      tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
      moduleExecutions: [],
      budgetExceeded: true,
    };
  }

  // ── Create conversation if needed ──
  if (!conversationId) {
    conversationId = await tenantDb.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({ tenantId, artifactId: artifactId!, customerId, channel, status: 'active' })
        .returning({ id: conversations.id });
      await tx.insert(conversationArtifactAssignments).values({
        tenantId,
        conversationId: conv.id,
        artifactId: artifactId!,
        assignmentReason: 'tenant_default_fallback',
      });
      return conv.id;
    });
  }

  // Save customer message + canned response
  await tenantDb.query(async (db) => {
    await db.insert(messages).values({ tenantId, conversationId: conversationId!, role: 'customer', content: messageText });
  });
  await tenantDb.query(async (db) => {
    await db.insert(messages).values({
      tenantId, conversationId: conversationId!,
      role: 'artifact', content: budgetResponse,
      tokensUsed: 0, modelUsed: 'budget_exceeded', costUsd: '0',
    });
  });

  const latencyMs = Date.now() - startTime;

  // Log telemetry (intent = 'budget_exceeded' — matches response.budgetExceeded flag)
  await tenantDb.query(async (db) => {
    await db.insert(interactionLogs).values({
      tenantId, artifactId: artifactId!, conversationId: conversationId!,
      intent: 'budget_exceeded', modelUsed: 'budget_exceeded',
      tokensIn: 0, tokensOut: 0, costUsd: '0', latencyMs,
    });
  });

  await tenantDb.query(async (db) => {
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId!));
  });

  trace.finalize({ modelUsed: 'budget_exceeded', costUsd: 0, tokensIn: 0, tokensOut: 0, latencyMs });

  return {
    conversationId: conversationId!,
    artifactId: artifactId!,
    responseText: budgetResponse,
    intent: budgetIntent,
    modelUsed: 'budget_exceeded',
    tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
    moduleExecutions: [],
    budgetExceeded: true,
  };
}

// ---------------------------------------------------------------------------
// Conversation limit handler
// ---------------------------------------------------------------------------

interface LimitHandlerInput {
  tenantDb: TenantDb;
  tenantId: string;
  channel: Channel;
  customerId: string;
  messageText: string;
  existingConversationId?: string;
  tenant: { name: string; defaultArtifactId: string | null } | undefined;
  trace: ReturnType<typeof createTrace>;
  startTime: number;
}

const LIMIT_INTENT: Intent = {
  type: 'general_inquiry', confidence: 0, complexity: 'simple',
  requires_knowledge_base: false, sentiment: 'neutral', source: 'regex',
};

const CONVERSATION_LIMIT_RESPONSE = 'This conversation has reached its message limit. Please start a new conversation to continue.';
const DAILY_LIMIT_RESPONSE = 'You have reached your daily message limit. Please try again tomorrow.';

export async function handleConversationLimitReached(input: LimitHandlerInput): Promise<HandleMessageOutput> {
  const { tenantDb, tenantId, channel, customerId, messageText, existingConversationId, tenant, trace, startTime } = input;

  let conversationId = existingConversationId;
  let artifactId: string | null = null;

  // Resolve artifact from existing conversation
  if (conversationId) {
    const assignment = await tenantDb.query(async (db) => {
      const rows = await db
        .select({ artifactId: conversationArtifactAssignments.artifactId })
        .from(conversationArtifactAssignments)
        .where(
          and(
            eq(conversationArtifactAssignments.conversationId, conversationId!),
            eq(conversationArtifactAssignments.isActive, true),
            isNull(conversationArtifactAssignments.endedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });
    artifactId = assignment?.artifactId ?? null;
  }

  // Fallback artifact resolution
  if (!artifactId) {
    artifactId = tenant?.defaultArtifactId ?? null;
    if (!artifactId) {
      const fallback = await tenantDb.query(async (db) => {
        const rows = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(and(eq(artifacts.tenantId, tenantId), eq(artifacts.isActive, true)))
          .orderBy(asc(artifacts.createdAt))
          .limit(1);
        return rows[0] ?? null;
      });
      artifactId = fallback?.id ?? null;
    }
  }

  if (!artifactId) {
    const latencyMs = Date.now() - startTime;
    trace.finalize({ modelUsed: 'conversation_limit', costUsd: 0, tokensIn: 0, tokensOut: 0, latencyMs });
    return {
      conversationId: conversationId ?? '',
      artifactId: '',
      responseText: CONVERSATION_LIMIT_RESPONSE,
      intent: LIMIT_INTENT,
      modelUsed: 'conversation_limit',
      tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
      moduleExecutions: [],
      conversationLimitReached: true,
    };
  }

  // Create conversation if needed
  if (!conversationId) {
    conversationId = await tenantDb.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({ tenantId, artifactId: artifactId!, customerId, channel, status: 'active' })
        .returning({ id: conversations.id });
      await tx.insert(conversationArtifactAssignments).values({
        tenantId, conversationId: conv.id, artifactId: artifactId!,
        assignmentReason: 'tenant_default_fallback',
      });
      return conv.id;
    });
  }

  // Save customer message + canned response
  await tenantDb.query(async (db) => {
    await db.insert(messages).values({ tenantId, conversationId: conversationId!, role: 'customer', content: messageText });
  });
  await tenantDb.query(async (db) => {
    await db.insert(messages).values({
      tenantId, conversationId: conversationId!,
      role: 'artifact', content: CONVERSATION_LIMIT_RESPONSE,
      tokensUsed: 0, modelUsed: 'conversation_limit', costUsd: '0',
    });
  });

  const latencyMs = Date.now() - startTime;

  await tenantDb.query(async (db) => {
    await db.insert(interactionLogs).values({
      tenantId, artifactId: artifactId!, conversationId: conversationId!,
      intent: 'conversation_limit', modelUsed: 'conversation_limit',
      tokensIn: 0, tokensOut: 0, costUsd: '0', latencyMs,
    });
  });

  await tenantDb.query(async (db) => {
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId!));
  });

  trace.finalize({ modelUsed: 'conversation_limit', costUsd: 0, tokensIn: 0, tokensOut: 0, latencyMs });

  return {
    conversationId: conversationId!,
    artifactId: artifactId!,
    responseText: CONVERSATION_LIMIT_RESPONSE,
    intent: LIMIT_INTENT,
    modelUsed: 'conversation_limit',
    tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
    moduleExecutions: [],
    conversationLimitReached: true,
  };
}

// ---------------------------------------------------------------------------
// Daily limit handler
// ---------------------------------------------------------------------------

export async function handleDailyLimitReached(input: LimitHandlerInput): Promise<HandleMessageOutput> {
  const { tenantDb, tenantId, channel, customerId, messageText, existingConversationId, tenant, trace, startTime } = input;

  let conversationId: string | undefined;
  let artifactId: string | null = null;

  if (existingConversationId) {
    const owned = await tenantDb.query(async (db) => {
      const rows = await db
        .select({
          id: conversations.id,
          artifactId: conversationArtifactAssignments.artifactId,
        })
        .from(conversations)
        .innerJoin(
          conversationArtifactAssignments,
          and(
            eq(conversationArtifactAssignments.conversationId, conversations.id),
            eq(conversationArtifactAssignments.isActive, true),
            isNull(conversationArtifactAssignments.endedAt),
          ),
        )
        .where(
          and(
            eq(conversations.id, existingConversationId),
            eq(conversations.customerId, customerId),
            eq(conversations.tenantId, tenantId),
            eq(conversations.status, 'active'),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    if (owned) {
      conversationId = owned.id;
      artifactId = owned.artifactId;
    }
  }

  if (!artifactId) {
    artifactId = tenant?.defaultArtifactId ?? null;
    if (!artifactId) {
      const fallback = await tenantDb.query(async (db) => {
        const rows = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(and(eq(artifacts.tenantId, tenantId), eq(artifacts.isActive, true)))
          .orderBy(asc(artifacts.createdAt))
          .limit(1);
        return rows[0] ?? null;
      });
      artifactId = fallback?.id ?? null;
    }
  }

  if (!artifactId) {
    const latencyMs = Date.now() - startTime;
    trace.finalize({ modelUsed: 'daily_limit', costUsd: 0, tokensIn: 0, tokensOut: 0, latencyMs });
    return {
      conversationId: '',
      artifactId: '',
      responseText: DAILY_LIMIT_RESPONSE,
      intent: LIMIT_INTENT,
      modelUsed: 'daily_limit',
      tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
      moduleExecutions: [],
      dailyLimitReached: true,
    };
  }

  if (!conversationId) {
    conversationId = await tenantDb.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({ tenantId, artifactId: artifactId!, customerId, channel, status: 'active' })
        .returning({ id: conversations.id });
      await tx.insert(conversationArtifactAssignments).values({
        tenantId, conversationId: conv.id, artifactId: artifactId!,
        assignmentReason: 'tenant_default_fallback',
      });
      return conv.id;
    });
  }

  await tenantDb.query(async (db) => {
    await db.insert(messages).values({ tenantId, conversationId: conversationId!, role: 'customer', content: messageText });
  });
  await tenantDb.query(async (db) => {
    await db.insert(messages).values({
      tenantId, conversationId: conversationId!,
      role: 'artifact', content: DAILY_LIMIT_RESPONSE,
      tokensUsed: 0, modelUsed: 'daily_limit', costUsd: '0',
    });
  });

  const latencyMs = Date.now() - startTime;

  await tenantDb.query(async (db) => {
    await db.insert(interactionLogs).values({
      tenantId, artifactId: artifactId!, conversationId: conversationId!,
      intent: 'daily_limit', modelUsed: 'daily_limit',
      tokensIn: 0, tokensOut: 0, costUsd: '0', latencyMs,
    });
  });

  await tenantDb.query(async (db) => {
    await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId!));
  });

  trace.finalize({ modelUsed: 'daily_limit', costUsd: 0, tokensIn: 0, tokensOut: 0, latencyMs });

  return {
    conversationId: conversationId!,
    artifactId: artifactId!,
    responseText: DAILY_LIMIT_RESPONSE,
    intent: LIMIT_INTENT,
    modelUsed: 'daily_limit',
    tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
    moduleExecutions: [],
    dailyLimitReached: true,
  };
}
