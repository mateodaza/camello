import { generateText } from 'ai';
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
} from '@camello/ai';
import type { MatchKnowledgeFn, EmbedFn } from '@camello/ai';
import type { ArtifactModuleBinding, Channel, Intent, ModuleDbCallbacks, PlanTier } from '@camello/shared/types';
import { COST_BUDGET_DEFAULTS, LEARNING_CONFIDENCE } from '@camello/shared/constants';
import { createClient } from '@supabase/supabase-js';
import { buildTelemetry, createTrace } from '../lib/langfuse.js';

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
  const { tenantDb, tenantId, channel, customerId, messageText, existingConversationId } = input;
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
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return rows[0];
  });

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
    return handleBudgetExceeded({
      tenantDb, tenantId, channel, customerId, messageText,
      existingConversationId, tenant, trace, startTime,
    });
  }

  // ── 2. Classify intent (first potentially paid step — LLM fallback) ──
  const intent = await trace.span('classify-intent', () => classifyIntent(messageText));

  // 3. Resolve artifact
  const resolver = createArtifactResolver({
    findActiveConversation: (custId) => findActiveConversation(tenantDb, custId),
    findMatchingRule: (ch, intentType, confidence) =>
      findMatchingRule(tenantDb, ch, intentType, confidence),
    getDefaultArtifact: () => getDefaultArtifact(tenantDb, tenantId),
  });

  const resolved = await trace.span('artifact-resolver', () =>
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

  // 4. Find or create conversation
  const conversationId = await findOrCreateConversation(
    tenantDb,
    tenantId,
    resolved,
    customerId,
    channel,
  );
  trace.setMetadata({ conversationId });

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

  // 6c. Build module DB callbacks (DI — keeps @camello/ai free of @camello/db)
  const moduleDbCallbacks: ModuleDbCallbacks = {
    insertLead: async (data) => {
      return tenantDb.query(async (db) => {
        const [row] = await db.insert(leads).values(data).returning({ id: leads.id });
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
  };

  // 6d. Build approval notifier (non-blocking — guardrail #4)
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
  };

  // 7. RAG search
  const embed: EmbedFn = generateEmbedding;
  const matchKnowledge: MatchKnowledgeFn = (params) =>
    tenantDb.query(async (db) => {
      const rows = await db.execute(sql`
        SELECT * FROM match_knowledge(
          ${params.queryEmbedding}::vector,
          ${params.queryText},
          ${params.tenantId}::uuid,
          ${params.docTypes ? sql`${params.docTypes}::text[]` : sql`NULL::text[]`},
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
    }),
  );

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

  // 9. Build system prompt (includes module instructions when bound)
  const systemPrompt = buildSystemPrompt({
    artifact: {
      name: artifact.name,
      role: artifact.type,
      personality: artifact.personality as Record<string, unknown>,
      constraints: artifact.constraints as Record<string, unknown>,
      config: artifact.config as Record<string, unknown>,
      companyName: tenant?.name ?? 'our company',
    },
    channel,
    ragContext: ragResult.directContext,
    proactiveContext: ragResult.proactiveContext,
    learnings: artifactLearnings.map((l) => l.content),
    modules: boundModules.map((m) => ({
      name: m.moduleName,
      slug: m.moduleSlug,
      description: m.moduleDescription,
      autonomyLevel: m.autonomyLevel,
    })),
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

  // 12. Build tools (if artifact has bound modules) and call LLM
  const client = createLLMClient();
  const tools = boundModules.length > 0
    ? buildToolsFromBindings(boundModules, {
        tenantId,
        artifactId: resolved.artifactId,
        conversationId,
        customerId,
        triggerMessageId,
        db: moduleDbCallbacks,
        onApprovalNeeded,
      })
    : undefined;

  const { text: responseText, usage, steps } = await generateText({
    model: client(modelId),
    system: systemPrompt,
    messages: chatMessages,
    tools,
    maxSteps: tools ? 5 : 1,
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

  const latencyMs = Date.now() - startTime;
  const tokensIn = usage?.promptTokens ?? 0;
  const tokensOut = usage?.completionTokens ?? 0;
  // Rough cost estimate — actual cost comes from OpenRouter callback
  const costUsd = estimateCost(modelId, tokensIn, tokensOut);

  // Extract module execution summaries from tool call steps
  const executedModules: Array<{ moduleSlug: string; status: string }> = [];
  for (const step of steps ?? []) {
    if (step.toolCalls) {
      for (const tc of step.toolCalls) {
        executedModules.push({ moduleSlug: tc.toolName, status: 'invoked' });
      }
    }
  }

  // 13. Save artifact response
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

  // 14. Log interaction telemetry
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
    });
  });

  // 15. Update conversation timestamp
  await tenantDb.query(async (db) => {
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  });

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
      })
      .returning({ id: conversations.id });

    // Record the artifact assignment
    await tx.insert(conversationArtifactAssignments).values({
      tenantId,
      conversationId: conv.id,
      artifactId: resolved.artifactId,
      assignmentReason: resolved.source === 'existing_conversation'
        ? 'route_rule'
        : resolved.source as 'route_rule' | 'tenant_default_fallback',
    });

    return conv.id;
  });
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/** Rough cost estimate per 1K tokens. Actual billing uses OpenRouter callbacks. */
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'google/gemini-2.0-flash-exp': { input: 0.0001, output: 0.0004 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'anthropic/claude-sonnet-4': { input: 0.003, output: 0.015 },
};

function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const rates = COST_PER_1K[model] ?? { input: 0.001, output: 0.002 };
  return (tokensIn / 1000) * rates.input + (tokensOut / 1000) * rates.output;
}

export function getUtcMonthWindow(date: Date): { monthStart: Date; nextMonthStart: Date } {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { monthStart, nextMonthStart };
}

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
}

export async function handleBudgetExceeded(input: BudgetExceededInput): Promise<HandleMessageOutput> {
  const { tenantDb, tenantId, channel, customerId, messageText, existingConversationId, tenant, trace, startTime } = input;
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
      responseText: BUDGET_EXCEEDED_RESPONSE,
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
      role: 'artifact', content: BUDGET_EXCEEDED_RESPONSE,
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
    responseText: BUDGET_EXCEEDED_RESPONSE,
    intent: budgetIntent,
    modelUsed: 'budget_exceeded',
    tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs,
    moduleExecutions: [],
    budgetExceeded: true,
  };
}
