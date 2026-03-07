import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, gte, inArray, isNull, isNotNull, asc, lt, lte } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import {
  artifacts,
  artifactModules,
  modules,
  conversations,
  messages,
  moduleExecutions,
  leads,
  customers,
  interactionLogs,
  conversationArtifactAssignments,
  tenants,
  payments,
  ownerNotifications,
} from '@camello/db';
import { paymentStatusSchema } from '@camello/shared/schemas';

// ---------------------------------------------------------------------------
// Shared input schemas
// ---------------------------------------------------------------------------

const artifactIdInput = z.object({ artifactId: z.string().uuid() });

const paginatedInput = z.object({
  artifactId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Agent router
// ---------------------------------------------------------------------------

export const agentRouter = router({
  // =========================================================================
  // workspace — artifact + bound modules + 30-day metrics + automationScore
  // =========================================================================

  workspace: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Fetch artifact
        const [artifact] = await db
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.tenantId, ctx.tenantId)))
          .limit(1);

        if (!artifact) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Artifact not found' });
        }

        // Bound modules with their definitions
        const boundModules = await db
          .select({
            id: artifactModules.id,
            moduleId: artifactModules.moduleId,
            autonomyLevel: artifactModules.autonomyLevel,
            autonomySource: artifactModules.autonomySource,
            configOverrides: artifactModules.configOverrides,
            slug: modules.slug,
            name: modules.name,
            category: modules.category,
          })
          .from(artifactModules)
          .innerJoin(modules, eq(artifactModules.moduleId, modules.id))
          .where(and(
            eq(artifactModules.artifactId, input.artifactId),
            eq(artifactModules.tenantId, ctx.tenantId),
          ));

        // 30-day execution metrics
        const thirtyDaysAgo = sql`now() - interval '30 days'`;
        const [metrics] = await db
          .select({
            totalExecutions: sql<number>`count(*)::int`,
            autonomousExecutions: sql<number>`count(*) FILTER (WHERE ${moduleExecutions.status} = 'executed')::int`,
            pendingApprovals: sql<number>`count(*) FILTER (WHERE ${moduleExecutions.status} = 'pending')::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            gte(moduleExecutions.createdAt, sql`${thirtyDaysAgo}`),
          ));

        const total = metrics?.totalExecutions ?? 0;
        const autonomous = metrics?.autonomousExecutions ?? 0;
        const automationScore = total > 0 ? Math.round((autonomous / total) * 100) : 0;

        // 30-day conversation count
        const [convMetrics] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, sql`${thirtyDaysAgo}`),
          ));

        return {
          artifact,
          boundModules,
          metrics: {
            totalExecutions: total,
            autonomousExecutions: autonomous,
            pendingApprovals: metrics?.pendingApprovals ?? 0,
            automationScore,
            conversationCount: convMetrics?.count ?? 0,
          },
        };
      });
    }),

  // =========================================================================
  // activityFeed — recent module executions for an artifact (timeline)
  // =========================================================================

  activityFeed: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            moduleSlug: moduleExecutions.moduleSlug,
            status: moduleExecutions.status,
            input: moduleExecutions.input,
            output: moduleExecutions.output,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
            executedAt: moduleExecutions.executedAt,
            durationMs: moduleExecutions.durationMs,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  // =========================================================================
  // SALES procedures
  // =========================================================================

  salesPipeline: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Leads grouped by stage with counts and total value
        const stageRows = await db
          .select({
            stage: leads.stage,
            count: sql<number>`count(*)::int`,
            totalValue: sql<string>`coalesce(sum(${leads.estimatedValue}), 0)::text`,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(leads.tenantId, ctx.tenantId),
          ))
          .groupBy(leads.stage);

        // Average days to close (closed_won only)
        const [velocityRow] = await db
          .select({
            avgDays: sql<number | null>`
              round(avg(extract(epoch from (${leads.convertedAt} - ${leads.qualifiedAt})) / 86400))::int
            `,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(leads.tenantId, ctx.tenantId),
            eq(leads.stage, 'closed_won'),
            isNotNull(leads.convertedAt),
            isNotNull(leads.qualifiedAt),
          ));

        // Sparklines: last 7 days, zero-filled via generate_series
        const sparklineRows = await db.execute(sql`
          WITH days AS (
            SELECT generate_series(
              (NOW() - interval '6 days')::date,
              NOW()::date,
              '1 day'::interval
            )::date AS day
          ),
          new_leads AS (
            SELECT DATE(l.created_at) AS day, count(*)::int AS cnt
            FROM leads l
            INNER JOIN conversations c ON l.conversation_id = c.id
            WHERE c.artifact_id = ${input.artifactId}
              AND l.tenant_id = ${ctx.tenantId}
              AND l.created_at >= NOW() - interval '6 days'
            GROUP BY DATE(l.created_at)
          ),
          won_value AS (
            SELECT DATE(l.converted_at) AS day,
                   coalesce(sum(l.estimated_value), 0)::text AS val
            FROM leads l
            INNER JOIN conversations c ON l.conversation_id = c.id
            WHERE c.artifact_id = ${input.artifactId}
              AND l.tenant_id = ${ctx.tenantId}
              AND l.stage = 'closed_won'
              AND l.converted_at >= NOW() - interval '6 days'
            GROUP BY DATE(l.converted_at)
          )
          SELECT
            d.day::text,
            coalesce(nl.cnt, 0) AS new_leads,
            coalesce(wv.val, '0') AS won_value
          FROM days d
          LEFT JOIN new_leads nl ON nl.day = d.day
          LEFT JOIN won_value wv ON wv.day = d.day
          ORDER BY d.day
        `);

        const sparklineArr = sparklineRows.rows as Array<{ day: string; new_leads: number; won_value: string }>;

        return {
          stages: stageRows,
          avgDaysToClose: velocityRow?.avgDays ?? null,
          sparklines: {
            newLeadsDaily: sparklineArr.map(r => ({ date: r.day, count: Number(r.new_leads) })),
            wonValueDaily: sparklineArr.map(r => ({ date: r.day, value: r.won_value })),
          },
        };
      });
    }),

  salesLeads: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      stage: z.enum(['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
      score: z.enum(['hot', 'warm', 'cold']).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(leads.tenantId, ctx.tenantId),
        ];
        if (input.stage) conditions.push(eq(leads.stage, input.stage));
        if (input.score) conditions.push(eq(leads.score, input.score));

        return db
          .select({
            id: leads.id,
            score: leads.score,
            stage: leads.stage,
            estimatedValue: leads.estimatedValue,
            budget: leads.budget,
            timeline: leads.timeline,
            summary: leads.summary,
            tags: leads.tags,
            qualifiedAt: leads.qualifiedAt,
            conversationId: leads.conversationId,
            customerName: customers.name,
            customerEmail: customers.email,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .innerJoin(customers, eq(leads.customerId, customers.id))
          .where(and(
            ...conditions,
            eq(conversations.artifactId, input.artifactId),
          ))
          .orderBy(desc(leads.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  salesQuotes: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // LEFT JOIN leads to enrich each quote with leadId + customerId.
        // Safe because idx_leads_conversation_unique ensures at most one lead
        // per non-null conversation_id (migration 0015).
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
            leadId: leads.id,
            customerId: leads.customerId,
          })
          .from(moduleExecutions)
          .leftJoin(leads, eq(leads.conversationId, moduleExecutions.conversationId))
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'send_quote'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  salesFunnel: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Stage-to-stage conversion rates
        // Count leads per stage to build a funnel view
        const stages = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
        const rows = await db
          .select({
            stage: leads.stage,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(leads.tenantId, ctx.tenantId),
          ))
          .groupBy(leads.stage);

        const countByStage: Record<string, number> = {};
        for (const row of rows) countByStage[row.stage] = row.count;

        return stages.map((stage) => ({
          stage,
          count: countByStage[stage] ?? 0,
        }));
      });
    }),

  updateLeadStage: tenantProcedure
    .input(z.object({
      leadId: z.string().uuid(),
      stage: z.enum(['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost']),
      closeReason: z.string().max(200).optional(),
      estimatedValue: z.number().nonnegative().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const now = new Date();
        const set: Record<string, unknown> = {
          stage: input.stage,
          updatedAt: now,
        };
        if (input.stage === 'closed_won' || input.stage === 'closed_lost') {
          set.convertedAt = now;
        }
        if (input.closeReason !== undefined) {
          set.closeReason = input.closeReason;
        }
        if (input.estimatedValue !== undefined) {
          set.estimatedValue = input.estimatedValue.toFixed(2);
        }

        const rows = await db
          .update(leads)
          .set(set)
          .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, ctx.tenantId)))
          .returning({ id: leads.id, stage: leads.stage });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
        }

        if (input.stage === 'closed_won') {
          const [leadMeta] = await db
            .select({
              artifactId: conversations.artifactId,
              conversationId: leads.conversationId,
              estimatedValue: leads.estimatedValue,
            })
            .from(leads)
            .leftJoin(conversations, eq(leads.conversationId, conversations.id))
            .where(eq(leads.id, input.leadId))
            .limit(1);

          if (leadMeta?.artifactId) {
            db.insert(ownerNotifications).values({
              tenantId: ctx.tenantId,
              artifactId: leadMeta.artifactId,
              leadId: input.leadId,
              type: 'deal_closed',
              title: 'Deal closed — won!',
              body: leadMeta.estimatedValue
                ? `Value: $${Number(leadMeta.estimatedValue).toLocaleString()}`
                : 'A deal was marked closed won.',
              metadata: {
                conversationId: leadMeta.conversationId,
                leadId: input.leadId,
                estimatedValue: leadMeta.estimatedValue ?? null,
              },
            }).catch(() => {
              // Swallow — notification failure must not fail the stage update
            });
          }
        }

        return rows[0];
      });
    }),

  // -------------------------------------------------------------------------
  // salesAlerts — stale leads, pending approvals, high-value early leads
  // -------------------------------------------------------------------------

  salesAlerts: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      // Main query: collect all alert data
      const result = await ctx.tenantDb.query(async (db) => {
        // Stale: active leads with last real activity > 3 days ago
        // GREATEST(COALESCE(max_interaction, lead.created_at), COALESCE(max_execution, lead.created_at))
        // ensures true maximum across both sources even when one is empty.
        const staleRows = await db.execute(sql`
          SELECT
            l.id,
            l.conversation_id,
            c.name AS customer_name,
            l.stage,
            l.estimated_value::text AS estimated_value,
            EXTRACT(DAY FROM NOW() - GREATEST(
              COALESCE(MAX(il.created_at), l.created_at),
              COALESCE(MAX(me.created_at), l.created_at)
            ))::int AS days_since_activity
          FROM leads l
          INNER JOIN conversations conv ON l.conversation_id = conv.id
          INNER JOIN customers c ON l.customer_id = c.id
          LEFT JOIN interaction_logs il ON il.conversation_id = l.conversation_id
          LEFT JOIN module_executions me ON me.conversation_id = l.conversation_id
          WHERE conv.artifact_id = ${input.artifactId}
            AND l.tenant_id = ${ctx.tenantId}
            AND l.stage NOT IN ('closed_won', 'closed_lost')
          GROUP BY l.id, c.name, l.stage, l.estimated_value, l.created_at, l.conversation_id
          HAVING GREATEST(
            COALESCE(MAX(il.created_at), l.created_at),
            COALESCE(MAX(me.created_at), l.created_at)
          ) < NOW() - INTERVAL '3 days'
          ORDER BY days_since_activity DESC
          LIMIT 20
        `);

        // Pending module approvals for sales modules
        const salesModuleSlugs = ['send_quote', 'collect_payment', 'qualify_lead', 'book_meeting'];
        const pendingRows = await db
          .select({
            id: moduleExecutions.id,
            moduleSlug: moduleExecutions.moduleSlug,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
            input: moduleExecutions.input,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.status, 'pending'),
            inArray(moduleExecutions.moduleSlug, salesModuleSlugs),
          ))
          .orderBy(asc(moduleExecutions.createdAt))
          .limit(10);

        // High-value early leads: estimated_value > median, stage in new/qualifying
        const highValueRows = await db.execute(sql`
          SELECT
            l.id,
            c.name AS customer_name,
            l.score,
            l.estimated_value::text AS estimated_value,
            l.stage
          FROM leads l
          INNER JOIN conversations conv ON l.conversation_id = conv.id
          INNER JOIN customers c ON l.customer_id = c.id
          WHERE conv.artifact_id = ${input.artifactId}
            AND l.tenant_id = ${ctx.tenantId}
            AND l.stage IN ('new', 'qualifying')
            AND l.estimated_value IS NOT NULL
            AND l.estimated_value > (
              SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY estimated_value)
              FROM leads
              WHERE tenant_id = ${ctx.tenantId} AND estimated_value IS NOT NULL
            )
          ORDER BY l.estimated_value DESC
          LIMIT 5
        `);

        type StaleRow = { id: string; conversation_id: string | null; customer_name: string; stage: string; estimated_value: string | null; days_since_activity: number };
        type HVRow = { id: string; customer_name: string; score: string; estimated_value: string; stage: string };

        return {
          staleLeads: (staleRows.rows as StaleRow[]).map(r => ({
            id: r.id,
            conversationId: r.conversation_id,
            customerName: r.customer_name,
            stage: r.stage,
            estimatedValue: r.estimated_value,
            daysSinceActivity: r.days_since_activity,
          })),
          pendingApprovals: pendingRows,
          highValueEarly: (highValueRows.rows as HVRow[]).map(r => ({
            id: r.id,
            customerName: r.customer_name,
            score: r.score,
            estimatedValue: r.estimated_value,
            stage: r.stage,
          })),
        };
      });

      // FIX Issue 2: Stale notification insert is a SEPARATE tenantDb.query call,
      // fire-and-forget at procedure level — not inside the main callback.
      // FIX Issue 3: Individual Drizzle ORM inserts with .onConflictDoNothing()
      // instead of raw SQL with ANY(uuid[]). The partial unique index
      // idx_notifications_stale_dedup handles dedup atomically.
      if (result.staleLeads.length > 0) {
        ctx.tenantDb.query(async (db) => {
          await Promise.all(
            result.staleLeads.map((lead) =>
              db.insert(ownerNotifications).values({
                tenantId: ctx.tenantId,
                artifactId: input.artifactId,
                leadId: lead.id,
                type: 'lead_stale',
                title: `Lead going cold: ${lead.customerName}`,
                body: `${lead.daysSinceActivity} days without activity`,
                metadata: {
                  conversationId: lead.conversationId,
                  leadId: lead.id,
                  daysSinceActivity: lead.daysSinceActivity,
                },
              }).onConflictDoNothing()
            )
          );
        }).catch(() => {
          // Swallow — stale notification failure must not break alert query
        });
      }

      return result;
    }),

  // -------------------------------------------------------------------------
  // salesLeadDetail — full lead context for the slide-over sheet
  // -------------------------------------------------------------------------

  salesLeadDetail: tenantProcedure
    .input(z.object({ leadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const [leadRow] = await db
          .select({
            id: leads.id,
            score: leads.score,
            stage: leads.stage,
            estimatedValue: leads.estimatedValue,
            budget: leads.budget,
            timeline: leads.timeline,
            summary: leads.summary,
            tags: leads.tags,
            closeReason: leads.closeReason,
            qualifiedAt: leads.qualifiedAt,
            convertedAt: leads.convertedAt,
            customerId: customers.id,
            customerName: customers.name,
            customerEmail: customers.email,
            customerPhone: customers.phone,
            conversationId: leads.conversationId,
          })
          .from(leads)
          .innerJoin(customers, eq(leads.customerId, customers.id))
          .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, ctx.tenantId)))
          .limit(1);

        if (!leadRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });

        // Attribution: message count, interaction count, total LLM cost
        const [attrRow] = await db
          .select({
            totalMessages: sql<number>`count(distinct ${messages.id})::int`,
            totalInteractions: sql<number>`count(distinct ${interactionLogs.id})::int`,
            totalCost: sql<string>`coalesce(sum(${interactionLogs.costUsd}), 0)::text`,
          })
          .from(conversations)
          .leftJoin(messages, eq(messages.conversationId, conversations.id))
          .leftJoin(interactionLogs, eq(interactionLogs.conversationId, conversations.id))
          .where(eq(conversations.id, leadRow.conversationId!));

        // Last 20 interactions
        const recentInteractions = await db
          .select({
            intent: interactionLogs.intent,
            costUsd: interactionLogs.costUsd,
            latencyMs: interactionLogs.latencyMs,
            createdAt: interactionLogs.createdAt,
          })
          .from(interactionLogs)
          .where(eq(interactionLogs.conversationId, leadRow.conversationId!))
          .orderBy(desc(interactionLogs.createdAt))
          .limit(20);

        // Last 10 module executions
        const recentExecutions = await db
          .select({
            moduleSlug: moduleExecutions.moduleSlug,
            status: moduleExecutions.status,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(eq(moduleExecutions.conversationId, leadRow.conversationId!))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(10);

        return {
          lead: {
            id: leadRow.id,
            score: leadRow.score,
            stage: leadRow.stage,
            estimatedValue: leadRow.estimatedValue,
            budget: leadRow.budget,
            timeline: leadRow.timeline,
            summary: leadRow.summary,
            tags: leadRow.tags,
            closeReason: leadRow.closeReason,
            qualifiedAt: leadRow.qualifiedAt,
            convertedAt: leadRow.convertedAt,
          },
          customer: {
            id: leadRow.customerId,
            name: leadRow.customerName,
            email: leadRow.customerEmail,
            phone: leadRow.customerPhone,
          },
          attribution: attrRow ?? { totalMessages: 0, totalInteractions: 0, totalCost: '0' },
          interactions: recentInteractions,
          executions: recentExecutions,
        };
      });
    }),

  // -------------------------------------------------------------------------
  // salesPayments — payments for an artifact, filtered by status
  // -------------------------------------------------------------------------

  salesPayments: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      status: paymentStatusSchema.optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(payments.artifactId, input.artifactId),
          eq(payments.tenantId, ctx.tenantId),
        ];
        if (input.status) conditions.push(eq(payments.status, input.status));

        return db
          .select({
            id: payments.id,
            amount: payments.amount,
            currency: payments.currency,
            description: payments.description,
            status: payments.status,
            leadId: payments.leadId,
            quoteExecutionId: payments.quoteExecutionId,
            dueDate: payments.dueDate,
            paidAt: payments.paidAt,
            createdAt: payments.createdAt,
            customerName: customers.name,
          })
          .from(payments)
          .leftJoin(customers, eq(payments.customerId, customers.id))
          .where(and(...conditions))
          .orderBy(desc(payments.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  // -------------------------------------------------------------------------
  // createPayment — create a payment with full FK ownership validation
  // -------------------------------------------------------------------------

  createPayment: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      leadId: z.string().uuid().optional(),
      conversationId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
      quoteExecutionId: z.string().uuid().optional(),
      amount: z.number().positive(),
      currency: z.enum(['USD', 'COP', 'MXN', 'BRL']).default('USD'),
      description: z.string().min(1),
      dueDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // FK ownership validation — reject with BAD_REQUEST (not NOT_FOUND) to avoid enumeration

        // 1. artifactId must belong to this tenant
        const [artifact] = await db
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.tenantId, ctx.tenantId)))
          .limit(1);
        if (!artifact) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid artifactId' });

        // 2. conversationId (if provided) must belong to this tenant AND this artifact
        if (input.conversationId) {
          const [conv] = await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(and(
              eq(conversations.id, input.conversationId),
              eq(conversations.tenantId, ctx.tenantId),
              eq(conversations.artifactId, input.artifactId),
            ))
            .limit(1);
          if (!conv) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid conversationId' });
        }

        // 3. leadId (if provided) must belong to this tenant and this artifact's conversations
        if (input.leadId) {
          const [lead] = await db
            .select({ id: leads.id })
            .from(leads)
            .innerJoin(conversations, eq(leads.conversationId, conversations.id))
            .where(and(
              eq(leads.id, input.leadId),
              eq(leads.tenantId, ctx.tenantId),
              eq(conversations.artifactId, input.artifactId),
            ))
            .limit(1);
          if (!lead) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid leadId' });
        }

        // 4. quoteExecutionId (if provided) must belong to this tenant AND this artifact
        if (input.quoteExecutionId) {
          const [exec] = await db
            .select({ id: moduleExecutions.id })
            .from(moduleExecutions)
            .where(and(
              eq(moduleExecutions.id, input.quoteExecutionId),
              eq(moduleExecutions.tenantId, ctx.tenantId),
              eq(moduleExecutions.artifactId, input.artifactId),
            ))
            .limit(1);
          if (!exec) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid quoteExecutionId' });
        }

        // 5. customerId (if provided) must belong to this tenant (customers are tenant-scoped)
        if (input.customerId) {
          const [customer] = await db
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
            .limit(1);
          if (!customer) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid customerId' });
        }

        const [row] = await db
          .insert(payments)
          .values({
            tenantId: ctx.tenantId,
            artifactId: input.artifactId,
            leadId: input.leadId,
            conversationId: input.conversationId,
            customerId: input.customerId,
            quoteExecutionId: input.quoteExecutionId,
            amount: input.amount.toFixed(2),
            currency: input.currency,
            description: input.description,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          })
          .returning({ id: payments.id, amount: payments.amount, currency: payments.currency, status: payments.status });

        return row;
      });
    }),

  // -------------------------------------------------------------------------
  // updatePaymentStatus — tenant + artifact scoped status update
  // -------------------------------------------------------------------------

  updatePaymentStatus: tenantProcedure
    .input(z.object({
      paymentId: z.string().uuid(),
      status: paymentStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const set: Record<string, unknown> = {
          status: input.status,
          updatedAt: new Date(),
        };
        if (input.status === 'paid') set.paidAt = new Date();

        const rows = await db
          .update(payments)
          .set(set)
          .where(and(eq(payments.id, input.paymentId), eq(payments.tenantId, ctx.tenantId)))
          .returning({ id: payments.id, status: payments.status });

        if (rows.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Payment not found' });
        return rows[0];
      });
    }),

  // -------------------------------------------------------------------------
  // salesLeadSummaries — unfiltered active leads for payment form selector
  // -------------------------------------------------------------------------

  salesLeadSummaries: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: leads.id,
            customerId: leads.customerId,
            conversationId: leads.conversationId,
            stage: leads.stage,
            score: leads.score,
            customerName: customers.name,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .innerJoin(customers, eq(leads.customerId, customers.id))
          .where(and(
            eq(leads.tenantId, ctx.tenantId),
            eq(conversations.artifactId, input.artifactId),
            sql`${leads.stage} NOT IN ('closed_won', 'closed_lost')`,
          ))
          .orderBy(asc(customers.name));
      });
    }),

  // -------------------------------------------------------------------------
  // salesAfterHours — after-hours conversation + pipeline ROI card
  // -------------------------------------------------------------------------

  salesAfterHours: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Resolve timezone: explicit tenant setting or default to America/Bogota (LATAM primary)
        const [tenantRow] = await db
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);

        const tz: string = (tenantRow?.settings as Record<string, unknown> | null)?.timezone as string | undefined ?? 'America/Bogota';

        const result = await db.execute(sql`
          WITH after_hours_convs AS (
            SELECT c.id, l.estimated_value
            FROM conversations c
            LEFT JOIN leads l ON l.conversation_id = c.id
            WHERE c.artifact_id = ${input.artifactId}
              AND c.tenant_id = ${ctx.tenantId}
              AND c.created_at >= NOW() - INTERVAL '30 days'
              AND (
                EXTRACT(HOUR FROM c.created_at AT TIME ZONE ${tz}) < 9
                OR EXTRACT(HOUR FROM c.created_at AT TIME ZONE ${tz}) >= 18
              )
          )
          SELECT
            COUNT(DISTINCT id)::int AS after_hours_conversations,
            COALESCE(SUM(estimated_value), 0)::text AS after_hours_pipeline_value
          FROM after_hours_convs
        `);

        const [totalRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, sql`NOW() - INTERVAL '30 days'`),
          ));

        type AfterHoursRow = { after_hours_conversations: number; after_hours_pipeline_value: string };
        const row = result.rows[0] as AfterHoursRow;

        return {
          afterHoursConversations: row.after_hours_conversations ?? 0,
          totalConversations: totalRow?.count ?? 0,
          afterHoursPipelineValue: row.after_hours_pipeline_value ?? '0',
          timezone: tz,
        };
      });
    }),

  // =========================================================================
  // SUPPORT procedures
  // =========================================================================

  supportTickets: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      status: z.enum(['open', 'in_progress', 'waiting', 'closed']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(moduleExecutions.artifactId, input.artifactId),
          eq(moduleExecutions.tenantId, ctx.tenantId),
          eq(moduleExecutions.moduleSlug, 'create_ticket'),
        ];

        // Push JSONB filters into SQL so pagination is deterministic
        if (input.status) {
          conditions.push(sql`${moduleExecutions.output}->>'status' = ${input.status}`);
        }
        if (input.priority) {
          conditions.push(sql`${moduleExecutions.output}->>'priority' = ${input.priority}`);
        }

        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(...conditions))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  supportEscalations: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Escalated conversations for this artifact
        return db
          .select({
            conversationId: conversations.id,
            status: conversations.status,
            customerId: conversations.customerId,
            customerName: customers.name,
            customerEmail: customers.email,
            updatedAt: conversations.updatedAt,
            metadata: conversations.metadata,
          })
          .from(conversations)
          .innerJoin(customers, eq(conversations.customerId, customers.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            eq(conversations.status, 'escalated'),
          ))
          .orderBy(desc(conversations.updatedAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  supportMetrics: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const thirtyDaysAgo = sql`now() - interval '30 days'`;

        // Open tickets
        const [ticketStats] = await db
          .select({
            total: sql<number>`count(*)::int`,
            open: sql<number>`count(*) FILTER (WHERE (${moduleExecutions.output}->>'status') = 'open')::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'create_ticket'),
            gte(moduleExecutions.createdAt, sql`${thirtyDaysAgo}`),
          ));

        // Resolution rate (resolved / total conversations)
        const [convStats] = await db
          .select({
            total: sql<number>`count(*)::int`,
            resolved: sql<number>`count(*) FILTER (WHERE ${conversations.status} = 'resolved')::int`,
            escalated: sql<number>`count(*) FILTER (WHERE ${conversations.status} = 'escalated')::int`,
          })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, sql`${thirtyDaysAgo}`),
          ));

        const totalConv = convStats?.total ?? 0;
        const resolvedConv = convStats?.resolved ?? 0;
        const resolutionRate = totalConv > 0 ? Math.round((resolvedConv / totalConv) * 100) : 0;

        // Top ticket categories (from output JSONB)
        const categories = await db
          .select({
            category: sql<string>`${moduleExecutions.output}->>'category'`,
            count: sql<number>`count(*)::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'create_ticket'),
            gte(moduleExecutions.createdAt, sql`${thirtyDaysAgo}`),
          ))
          .groupBy(sql`${moduleExecutions.output}->>'category'`)
          .orderBy(desc(sql`count(*)`))
          .limit(10);

        return {
          totalTickets: ticketStats?.total ?? 0,
          openTickets: ticketStats?.open ?? 0,
          totalConversations: totalConv,
          resolvedConversations: resolvedConv,
          escalatedConversations: convStats?.escalated ?? 0,
          resolutionRate,
          topCategories: categories,
        };
      });
    }),

  supportKnowledgeGaps: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Intents with no RAG hits — resolution_type will be null or 'no_knowledge'
        // Group by intent to find common gaps
        return db
          .select({
            intent: interactionLogs.intent,
            count: sql<number>`count(*)::int`,
            lastSeen: sql<string>`max(${interactionLogs.createdAt})::text`,
          })
          .from(interactionLogs)
          .where(and(
            eq(interactionLogs.artifactId, input.artifactId),
            eq(interactionLogs.tenantId, ctx.tenantId),
            isNull(interactionLogs.resolutionType),
            gte(interactionLogs.createdAt, sql`now() - interval '30 days'`),
          ))
          .groupBy(interactionLogs.intent)
          .orderBy(desc(sql`count(*)`))
          .limit(input.limit);
      });
    }),

  updateTicketStatus: tenantProcedure
    .input(z.object({
      executionId: z.string().uuid(),
      status: z.enum(['open', 'in_progress', 'waiting', 'closed']),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Update the ticket status inside the output JSONB
        const rows = await db
          .update(moduleExecutions)
          .set({
            output: sql`jsonb_set(COALESCE(output, '{}'), '{status}', ${JSON.stringify(input.status)}::jsonb)`,
          })
          .where(and(
            eq(moduleExecutions.id, input.executionId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'create_ticket'),
          ))
          .returning({ id: moduleExecutions.id, output: moduleExecutions.output });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }
        return rows[0];
      });
    }),

  acknowledgeEscalation: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Move escalated conversation to active (owner is now handling it)
        const rows = await db
          .update(conversations)
          .set({ status: 'active', updatedAt: new Date() })
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
            eq(conversations.status, 'escalated'),
          ))
          .returning({ id: conversations.id, status: conversations.status });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Escalated conversation not found' });
        }
        return rows[0];
      });
    }),

  // =========================================================================
  // MARKETING procedures
  // =========================================================================

  marketingEngagement: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'capture_interest'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingFollowups: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'send_followup'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingDrafts: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'draft_content'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingInterestMap: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            topic: sql<string>`${moduleExecutions.output}->>'product_or_topic'`,
            interestLevel: sql<string>`${moduleExecutions.output}->>'interest_level'`,
            count: sql<number>`count(*)::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'capture_interest'),
            gte(moduleExecutions.createdAt, sql`now() - interval '30 days'`),
          ))
          .groupBy(
            sql`${moduleExecutions.output}->>'product_or_topic'`,
            sql`${moduleExecutions.output}->>'interest_level'`,
          )
          .orderBy(desc(sql`count(*)`));
      });
    }),

  // =========================================================================
  // HANDOFF procedures (#50)
  // =========================================================================

  initiateHandoff: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      targetArtifactId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.transaction(async (tx) => {
        // 1. Fetch conversation + verify ownership
        const [conv] = await tx
          .select({
            id: conversations.id,
            artifactId: conversations.artifactId,
          })
          .from(conversations)
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
          ))
          .limit(1);

        if (!conv) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }

        // Anti-loop: no same-artifact transfer
        if (conv.artifactId === input.targetArtifactId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot handoff to the same artifact' });
        }

        // Verify target artifact exists and belongs to this tenant
        const [targetArtifact] = await tx
          .select({ id: artifacts.id, name: artifacts.name, type: artifacts.type })
          .from(artifacts)
          .where(and(
            eq(artifacts.id, input.targetArtifactId),
            eq(artifacts.tenantId, ctx.tenantId),
            eq(artifacts.isActive, true),
          ))
          .limit(1);

        if (!targetArtifact) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Target artifact not found or inactive' });
        }

        // Anti-loop: max 3 handoff hops
        const [hopCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(conversationArtifactAssignments)
          .where(eq(conversationArtifactAssignments.conversationId, input.conversationId));

        if ((hopCount?.count ?? 0) >= 3) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Maximum handoff limit (3) reached for this conversation',
          });
        }

        // Anti-loop: 5-minute cooldown (only between handoff assignments, not initial routing)
        const [recentHandoff] = await tx
          .select({ id: conversationArtifactAssignments.id })
          .from(conversationArtifactAssignments)
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.assignmentReason, 'handoff'),
            gte(conversationArtifactAssignments.startedAt, sql`now() - interval '5 minutes'`),
          ))
          .orderBy(desc(conversationArtifactAssignments.startedAt))
          .limit(1);

        if (recentHandoff) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Handoff cooldown: please wait 5 minutes between handoffs',
          });
        }

        // Anti-loop: circular detection (target was source within same session)
        const [circular] = await tx
          .select({ id: conversationArtifactAssignments.id })
          .from(conversationArtifactAssignments)
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.artifactId, input.targetArtifactId),
            gte(conversationArtifactAssignments.startedAt, sql`now() - interval '1 hour'`),
          ))
          .limit(1);

        if (circular) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Circular handoff detected: this artifact already handled this conversation recently',
          });
        }

        const now = new Date();

        // 2. End current assignment
        await tx
          .update(conversationArtifactAssignments)
          .set({ isActive: false, endedAt: now })
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.isActive, true),
            isNull(conversationArtifactAssignments.endedAt),
          ));

        // 3. Create new assignment
        await tx
          .insert(conversationArtifactAssignments)
          .values({
            tenantId: ctx.tenantId,
            conversationId: input.conversationId,
            artifactId: input.targetArtifactId,
            assignmentReason: 'handoff',
            isActive: true,
            startedAt: now,
            metadata: {
              transferred_by: ctx.userId,
              transfer_reason: input.reason,
              source_artifact_id: conv.artifactId,
            },
          });

        // 4. Sync conversations.artifact_id
        await tx
          .update(conversations)
          .set({ artifactId: input.targetArtifactId, updatedAt: now })
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
          ));

        return {
          conversationId: input.conversationId,
          targetArtifact: {
            id: targetArtifact.id,
            name: targetArtifact.name,
            type: targetArtifact.type,
          },
          handoffReason: input.reason,
        };
      });
    }),

  handoffHistory: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: conversationArtifactAssignments.id,
            artifactId: conversationArtifactAssignments.artifactId,
            artifactName: artifacts.name,
            artifactType: artifacts.type,
            assignmentReason: conversationArtifactAssignments.assignmentReason,
            isActive: conversationArtifactAssignments.isActive,
            startedAt: conversationArtifactAssignments.startedAt,
            endedAt: conversationArtifactAssignments.endedAt,
            metadata: conversationArtifactAssignments.metadata,
          })
          .from(conversationArtifactAssignments)
          .innerJoin(artifacts, eq(conversationArtifactAssignments.artifactId, artifacts.id))
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.tenantId, ctx.tenantId),
          ))
          .orderBy(asc(conversationArtifactAssignments.startedAt));
      });
    }),

  // =========================================================================
  // INTENT PRIORITY procedures (#59)
  // =========================================================================

  highPriorityIntents: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Read priority intents from tenant settings (with default fallback)
        const [tenant] = await db
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);

        const settings = tenant?.settings as Record<string, unknown> | null;
        const priorityIntents = Array.isArray(settings?.priorityIntents)
          ? (settings.priorityIntents as string[])
          : ['complaint', 'escalation_request', 'negotiation'];

        if (priorityIntents.length === 0) return [];

        // Filter interaction_logs for priority intents in last 7 days
        return db
          .select({
            intent: interactionLogs.intent,
            count: sql<number>`count(*)::int`,
            latestConversationId: sql<string>`(array_agg(${interactionLogs.conversationId} ORDER BY ${interactionLogs.createdAt} DESC))[1]::text`,
            lastSeen: sql<string>`max(${interactionLogs.createdAt})::text`,
          })
          .from(interactionLogs)
          .where(and(
            eq(interactionLogs.artifactId, input.artifactId),
            eq(interactionLogs.tenantId, ctx.tenantId),
            inArray(interactionLogs.intent, priorityIntents),
            gte(interactionLogs.createdAt, sql`now() - interval '7 days'`),
          ))
          .groupBy(interactionLogs.intent)
          .orderBy(desc(sql`count(*)`));
      });
    }),

  updatePriorityIntents: tenantProcedure
    .input(z.object({
      intents: z.array(z.enum([
        'greeting', 'pricing', 'availability', 'product_question',
        'complaint', 'booking_request', 'followup', 'negotiation',
        'technical_support', 'general_inquiry', 'escalation_request',
        'simple_question', 'farewell', 'thanks',
      ])).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        await db
          .update(tenants)
          .set({
            settings: sql`jsonb_set(COALESCE(settings, '{}'), '{priorityIntents}', ${JSON.stringify(input.intents)}::jsonb)`,
          })
          .where(eq(tenants.id, ctx.tenantId));

        return { intents: input.intents };
      });
    }),

  // =========================================================================
  // OWNER NOTIFICATIONS procedures
  // =========================================================================

  ownerNotifications: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).default(30),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select()
          .from(ownerNotifications)
          .where(and(
            eq(ownerNotifications.artifactId, input.artifactId),
            eq(ownerNotifications.tenantId, ctx.tenantId),
          ))
          .orderBy(
            asc(sql`CASE WHEN ${ownerNotifications.readAt} IS NULL THEN 0 ELSE 1 END`),
            desc(ownerNotifications.createdAt),
          )
          .limit(input.limit)
          .offset(input.offset);

        const [countRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(ownerNotifications)
          .where(and(
            eq(ownerNotifications.artifactId, input.artifactId),
            eq(ownerNotifications.tenantId, ctx.tenantId),
            isNull(ownerNotifications.readAt),
          ));

        return { notifications: rows, unreadCount: countRow?.count ?? 0 };
      });
    }),

  markNotificationRead: tenantProcedure
    .input(z.object({ notificationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        await db
          .update(ownerNotifications)
          .set({ readAt: new Date() })
          .where(and(
            eq(ownerNotifications.id, input.notificationId),
            eq(ownerNotifications.tenantId, ctx.tenantId),
            isNull(ownerNotifications.readAt),
          ));
      });
    }),

  markAllNotificationsRead: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        await db
          .update(ownerNotifications)
          .set({ readAt: new Date() })
          .where(and(
            eq(ownerNotifications.artifactId, input.artifactId),
            eq(ownerNotifications.tenantId, ctx.tenantId),
            isNull(ownerNotifications.readAt),
          ));
      });
    }),

  unreadNotificationCount: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(ownerNotifications)
          .where(and(
            eq(ownerNotifications.artifactId, input.artifactId),
            eq(ownerNotifications.tenantId, ctx.tenantId),
            isNull(ownerNotifications.readAt),
          ));
        return { count: row?.count ?? 0 };
      });
    }),
});
