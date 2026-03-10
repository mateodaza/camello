import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, gte, inArray, isNull, isNotNull, asc, lt, lte, not } from 'drizzle-orm';
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
  leadNotes,
  leadStageChanges,
  artifactMetricsDaily,
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
        // LEFT JOIN customers to surface the customer name in the UI.
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
            leadId: leads.id,
            customerId: leads.customerId,
            customerName: sql<string | null>`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')`,
            amount: sql<string | null>`${moduleExecutions.output}->>'total'`,
            quoteStatus: sql<string | null>`${moduleExecutions.output}->>'status'`,
          })
          .from(moduleExecutions)
          .leftJoin(leads, eq(leads.conversationId, moduleExecutions.conversationId))
          .leftJoin(customers, eq(customers.id, leads.customerId))
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

  salesMeetings: tenantProcedure
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
            leadId: leads.id,
            customerId: leads.customerId,
            customerName: sql<string | null>`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')`,
            datetime: sql<string | null>`${moduleExecutions.output}->>'datetime'`,
            topic: sql<string | null>`${moduleExecutions.input}->>'topic'`,
            booked: sql<boolean | null>`(${moduleExecutions.output}->>'booked')::boolean`,
          })
          .from(moduleExecutions)
          .leftJoin(leads, eq(leads.conversationId, moduleExecutions.conversationId))
          .leftJoin(customers, eq(customers.id, leads.customerId))
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'book_meeting'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  salesFollowups: tenantProcedure
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
            leadId: leads.id,
            customerId: leads.customerId,
            customerName: sql<string | null>`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')`,
            followupStatus: sql<string | null>`${moduleExecutions.output}->>'followup_status'`,
            scheduledAt: sql<string | null>`${moduleExecutions.output}->>'scheduled_at'`,
            channel: sql<string | null>`${moduleExecutions.output}->>'channel'`,
            messageTemplate: sql<string | null>`${moduleExecutions.input}->>'message_template'`,
          })
          .from(moduleExecutions)
          .leftJoin(leads, eq(leads.conversationId, moduleExecutions.conversationId))
          .leftJoin(customers, eq(customers.id, leads.customerId))
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

  salesSourceBreakdown: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({
            channel: leads.sourceChannel,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(leads.tenantId, ctx.tenantId),
          ))
          .groupBy(leads.sourceChannel)
          .orderBy(desc(sql`count(*)`));

        return rows.map(r => ({
          channel: r.channel ?? 'unknown',
          count: r.count,
        }));
      });
    }),

  // =========================================================================
  // salesComparison — this week vs last week for 4 metrics
  // =========================================================================

  salesComparison: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db.execute(sql`
          WITH week_bounds AS (
            SELECT
              date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                AS this_start,
              (date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
                + INTERVAL '7 days'
                AS next_start,
              (date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
                - INTERVAL '7 days'
                AS last_start
          ),
          lead_counts AS (
            SELECT
              COUNT(*) FILTER (
                WHERE l.created_at >= wb.this_start AND l.created_at < wb.next_start
              )::int AS this_new_leads,
              COUNT(*) FILTER (
                WHERE l.created_at >= wb.last_start AND l.created_at < wb.this_start
              )::int AS last_new_leads,
              COUNT(*) FILTER (
                WHERE l.stage = 'closed_won'
                  AND l.converted_at >= wb.this_start AND l.converted_at < wb.next_start
              )::int AS this_won_deals,
              COUNT(*) FILTER (
                WHERE l.stage = 'closed_won'
                  AND l.converted_at >= wb.last_start AND l.converted_at < wb.this_start
              )::int AS last_won_deals,
              COALESCE(SUM(l.estimated_value) FILTER (
                WHERE l.stage = 'closed_won'
                  AND l.converted_at >= wb.this_start AND l.converted_at < wb.next_start
              ), 0)::text AS this_revenue,
              COALESCE(SUM(l.estimated_value) FILTER (
                WHERE l.stage = 'closed_won'
                  AND l.converted_at >= wb.last_start AND l.converted_at < wb.this_start
              ), 0)::text AS last_revenue
            FROM leads l
            INNER JOIN conversations c ON c.id = l.conversation_id
            CROSS JOIN week_bounds wb
            WHERE c.artifact_id = ${input.artifactId}
              AND l.tenant_id = ${ctx.tenantId}
          ),
          conv_counts AS (
            SELECT
              COUNT(*) FILTER (
                WHERE c.created_at >= wb.this_start AND c.created_at < wb.next_start
              )::int AS this_conversations,
              COUNT(*) FILTER (
                WHERE c.created_at >= wb.last_start AND c.created_at < wb.this_start
              )::int AS last_conversations
            FROM conversations c
            CROSS JOIN week_bounds wb
            WHERE c.artifact_id = ${input.artifactId}
              AND c.tenant_id = ${ctx.tenantId}
          )
          SELECT lc.*, cc.*
          FROM lead_counts lc, conv_counts cc
        `);

        type ComparisonRow = {
          this_new_leads: number; last_new_leads: number;
          this_won_deals: number; last_won_deals: number;
          this_revenue: string;   last_revenue: string;
          this_conversations: number; last_conversations: number;
        };

        const row = (rows.rows as ComparisonRow[])[0] ?? {
          this_new_leads: 0, last_new_leads: 0,
          this_won_deals: 0, last_won_deals: 0,
          this_revenue: '0', last_revenue: '0',
          this_conversations: 0, last_conversations: 0,
        };

        function delta(current: number, last: number): number | null {
          if (last === 0) return null;
          return Math.round(((current - last) / last) * 100);
        }

        const thisWeek = {
          newLeads: row.this_new_leads,
          wonDeals: row.this_won_deals,
          totalRevenue: Number(row.this_revenue),
          conversations: row.this_conversations,
        };
        const lastWeek = {
          newLeads: row.last_new_leads,
          wonDeals: row.last_won_deals,
          totalRevenue: Number(row.last_revenue),
          conversations: row.last_conversations,
        };

        return {
          thisWeek,
          lastWeek,
          deltas: {
            newLeads: delta(thisWeek.newLeads, lastWeek.newLeads),
            wonDeals: delta(thisWeek.wonDeals, lastWeek.wonDeals),
            totalRevenue: delta(thisWeek.totalRevenue, lastWeek.totalRevenue),
            conversations: delta(thisWeek.conversations, lastWeek.conversations),
          },
        };
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
            await db.insert(ownerNotifications).values({
              tenantId: ctx.tenantId,
              artifactId: leadMeta.artifactId,
              leadId: input.leadId,
              type: 'deal_closed',
              title: 'Deal closed',
              body: leadMeta.estimatedValue
                ? `$${Number(leadMeta.estimatedValue).toLocaleString('en-US')}`
                : 'closed_won',
              metadata: {
                conversationId: leadMeta.conversationId,
                leadId: input.leadId,
                estimatedValue: leadMeta.estimatedValue ?? null,
              },
            }).catch((err: unknown) => {
              console.warn('[agent.updateLeadStage] deal_closed notification failed:', err instanceof Error ? err.message : String(err));
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
        void ctx.tenantDb.query(async (db) => {
          const results = await Promise.allSettled(
            result.staleLeads.map((lead) =>
              db.insert(ownerNotifications).values({
                tenantId: ctx.tenantId,
                artifactId: input.artifactId,
                leadId: lead.id,
                type: 'lead_stale',
                title: lead.customerName,
                body: `${lead.daysSinceActivity}d`,
                metadata: {
                  conversationId: lead.conversationId,
                  leadId: lead.id,
                  daysSinceActivity: lead.daysSinceActivity,
                },
              }).onConflictDoNothing()
            )
          );
          const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (failures.length > 0) {
            console.warn(`[agent.salesAlerts] ${failures.length}/${results.length} stale notification inserts failed`);
          }
        }).catch((err: unknown) => {
          console.warn('[agent.salesAlerts] stale notification batch failed:', err instanceof Error ? err.message : String(err));
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

        // Lead notes (up to 50, oldest first for timeline ordering)
        const notes = await db
          .select({ id: leadNotes.id, author: leadNotes.author, content: leadNotes.content, createdAt: leadNotes.createdAt })
          .from(leadNotes)
          .where(and(eq(leadNotes.leadId, leadRow.id), eq(leadNotes.tenantId, ctx.tenantId)))
          .orderBy(asc(leadNotes.createdAt))
          .limit(50);

        // Recent messages (up to 30) — skip if no conversationId
        const recentMessages = leadRow.conversationId
          ? await db
              .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
              .from(messages)
              .where(eq(messages.conversationId, leadRow.conversationId))
              .orderBy(desc(messages.createdAt))
              .limit(30)
          : [];

        // Stage changes for this lead (trigger-populated, all code paths)
        const stageChanges = await db
          .select({ id: leadStageChanges.id, fromStage: leadStageChanges.fromStage, toStage: leadStageChanges.toStage, createdAt: leadStageChanges.createdAt })
          .from(leadStageChanges)
          .where(and(eq(leadStageChanges.leadId, leadRow.id), eq(leadStageChanges.tenantId, ctx.tenantId)))
          .orderBy(asc(leadStageChanges.createdAt));

        // Conversation summary + resolvedAt (for lead timeline)
        const conversationMeta = leadRow.conversationId
          ? await db
              .select({
                summary: sql<string | null>`(${conversations.metadata}->>'summary')`,
                resolvedAt: conversations.resolvedAt,
              })
              .from(conversations)
              .where(eq(conversations.id, leadRow.conversationId!))
              .limit(1)
              .then((rows) => rows[0] ?? null)
          : null;

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
          notes,
          messages: recentMessages,
          stageChanges,
          conversationSummary: conversationMeta?.summary ?? null,
          conversationResolvedAt: conversationMeta?.resolvedAt ?? null,
        };
      });
    }),

  // -------------------------------------------------------------------------
  // leadNotes — fetch notes for a lead
  // -------------------------------------------------------------------------

  leadNotes: tenantProcedure
    .input(z.object({ leadId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const [leadRow] = await db
          .select({ id: leads.id })
          .from(leads)
          .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, ctx.tenantId)))
          .limit(1);

        if (!leadRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });

        return db
          .select({ id: leadNotes.id, leadId: leadNotes.leadId, author: leadNotes.author, content: leadNotes.content, createdAt: leadNotes.createdAt })
          .from(leadNotes)
          .where(and(eq(leadNotes.leadId, input.leadId), eq(leadNotes.tenantId, ctx.tenantId)))
          .orderBy(asc(leadNotes.createdAt));
      });
    }),

  // -------------------------------------------------------------------------
  // addLeadNote — add an owner note to a lead
  // -------------------------------------------------------------------------

  addLeadNote: tenantProcedure
    .input(z.object({ leadId: z.string().uuid(), content: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const [leadRow] = await db
          .select({ id: leads.id })
          .from(leads)
          .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, ctx.tenantId)))
          .limit(1);

        if (!leadRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });

        const [note] = await db
          .insert(leadNotes)
          .values({ tenantId: ctx.tenantId, leadId: input.leadId, author: 'owner', content: input.content })
          .returning();

        return note;
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
            customerName: sql<string | null>`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')`,
            conversationId: payments.conversationId,
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
            customerName: sql<string>`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')`,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .innerJoin(customers, eq(leads.customerId, customers.id))
          .where(and(
            eq(leads.tenantId, ctx.tenantId),
            eq(conversations.artifactId, input.artifactId),
            sql`${leads.stage} NOT IN ('closed_won', 'closed_lost')`,
          ))
          .orderBy(sql`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')`);
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

        const rawTz = (tenantRow?.settings as Record<string, unknown> | null)?.timezone;
        let tz = 'America/Bogota';
        if (typeof rawTz === 'string') {
          try { Intl.DateTimeFormat(undefined, { timeZone: rawTz }); tz = rawTz; } catch { /* invalid tz, keep default */ }
        }

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
            conversationStatus: conversations.status,
            csat: sql<number | null>`(${conversations.metadata}->>'csat')::numeric`,
          })
          .from(moduleExecutions)
          .leftJoin(
            conversations,
            and(
              eq(moduleExecutions.conversationId, conversations.id),
              eq(conversations.tenantId, ctx.tenantId),
            ),
          )
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
        type GapRow = { intent: string; count: number; last_seen: string; sample_question: string | null };
        const result = await db.execute(sql`
          SELECT
            lower(trim(il.intent))           AS intent,
            count(*)::int                    AS count,
            max(il.created_at)::text         AS last_seen,
            (
              SELECT m.content
              FROM messages m
              WHERE m.conversation_id = (
                  SELECT il2.conversation_id
                  FROM interaction_logs il2
                  WHERE lower(trim(il2.intent)) = lower(trim(il.intent))
                    AND il2.artifact_id = ${input.artifactId}
                    AND il2.tenant_id = ${ctx.tenantId}
                    AND il2.resolution_type IS NULL
                  ORDER BY il2.tokens_out ASC NULLS LAST
                  LIMIT 1
                )
                AND m.role = 'customer'
                AND m.tenant_id = ${ctx.tenantId}
              ORDER BY m.created_at ASC
              LIMIT 1
            ) AS sample_question
          FROM interaction_logs il
          WHERE il.artifact_id = ${input.artifactId}
            AND il.tenant_id = ${ctx.tenantId}
            AND il.resolution_type IS NULL
            AND il.created_at >= now() - interval '30 days'
          GROUP BY lower(trim(il.intent))
          ORDER BY count DESC
          LIMIT ${input.limit}
        `);
        return (result.rows as GapRow[]).map((r) => ({
          intent: r.intent,
          count: r.count,
          lastSeen: r.last_seen,
          sampleQuestion: r.sample_question ?? null,
        }));
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

  supportResolutionStats: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const thirtyDaysAgo = sql`now() - interval '30 days'`;

        const [stats] = await db
          .select({
            total: sql<number>`count(*)::int`,
            resolved: sql<number>`count(*) FILTER (WHERE ${conversations.status} = 'resolved')::int`,
            avgCsat: sql<number | null>`avg((${conversations.metadata}->>'csat')::numeric)`,
          })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, thirtyDaysAgo),
          ));

        const total = stats?.total ?? 0;
        const resolved = stats?.resolved ?? 0;
        const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;
        const avgCsat = stats?.avgCsat != null
          ? Math.round(stats.avgCsat * 10) / 10
          : null;

        return { resolvedCount: resolved, avgCsat, resolutionRate };
      });
    }),

  storeCsatRating: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .update(conversations)
          .set({
            metadata: sql`metadata || jsonb_build_object('csat', ${input.rating})`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
            eq(conversations.status, 'resolved'),
          ))
          .returning({ id: conversations.id });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Resolved conversation not found' });
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
            eq(moduleExecutions.status, 'executed'),
            sql`(${moduleExecutions.output}->>'draft_status') IS NULL`,
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingStats: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const result = await db.execute(sql`
          WITH
            interest_stats AS (
              SELECT count(*)::int AS total_interests
              FROM module_executions
              WHERE artifact_id = ${input.artifactId}::uuid
                AND tenant_id = ${ctx.tenantId}::uuid
                AND module_slug = 'capture_interest'
                AND status = 'executed'
            ),
            top_cats AS (
              SELECT output->>'product_or_topic' AS topic, count(*)::int AS count
              FROM module_executions
              WHERE artifact_id = ${input.artifactId}::uuid
                AND tenant_id = ${ctx.tenantId}::uuid
                AND module_slug = 'capture_interest'
                AND status = 'executed'
              GROUP BY output->>'product_or_topic'
              ORDER BY count(*) DESC
              LIMIT 3
            ),
            draft_stats AS (
              SELECT count(*)::int AS draft_count
              FROM module_executions
              WHERE artifact_id = ${input.artifactId}::uuid
                AND tenant_id = ${ctx.tenantId}::uuid
                AND module_slug = 'draft_content'
                AND status = 'executed'
                AND (output->>'draft_status') IS NULL
            )
          SELECT
            (SELECT total_interests FROM interest_stats) AS total_interests,
            (SELECT json_agg(top_cats ORDER BY count DESC) FROM top_cats) AS top_categories,
            (SELECT draft_count FROM draft_stats) AS draft_count
        `);
        const row = (result.rows[0] ?? {}) as Record<string, unknown>;
        const rawCats = row.top_categories as Array<{ topic: string | null; count: number }> | null;
        return {
          totalInterests: (row.total_interests as number) ?? 0,
          topCategories: rawCats ?? [],
          draftCount: (row.draft_count as number) ?? 0,
        };
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

  salesForecast: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db.execute(sql`
          WITH date_bound AS (
            SELECT NOW() - INTERVAL '90 days' AS start_90d
          ),
          stage_history AS (
            SELECT
              lsc.to_stage AS stage,
              COUNT(DISTINCT lsc.lead_id) FILTER (WHERE l.stage = 'closed_won')::int   AS won_count,
              COUNT(DISTINCT lsc.lead_id) FILTER (WHERE l.stage IN ('closed_won', 'closed_lost'))::int AS terminated_count
            FROM lead_stage_changes lsc
            INNER JOIN leads l ON l.id = lsc.lead_id
            INNER JOIN conversations c ON c.id = l.conversation_id
            CROSS JOIN date_bound db
            WHERE lsc.created_at >= db.start_90d
              AND lsc.to_stage IN ('qualifying', 'proposal', 'negotiation')
              AND lsc.tenant_id = ${ctx.tenantId}
              AND c.artifact_id = ${input.artifactId}
            GROUP BY lsc.to_stage
          ),
          active_pipeline AS (
            SELECT
              l.stage,
              COUNT(*)::int                              AS lead_count,
              COALESCE(SUM(l.estimated_value), 0)::text AS total_value
            FROM leads l
            INNER JOIN conversations c ON c.id = l.conversation_id
            WHERE c.artifact_id = ${input.artifactId}
              AND l.tenant_id = ${ctx.tenantId}
              AND l.stage IN ('qualifying', 'proposal', 'negotiation')
            GROUP BY l.stage
          )
          SELECT
            ap.stage,
            ap.lead_count,
            ap.total_value,
            COALESCE(sh.won_count, 0)        AS won_count,
            COALESCE(sh.terminated_count, 0) AS terminated_count
          FROM active_pipeline ap
          LEFT JOIN stage_history sh ON sh.stage = ap.stage
          ORDER BY CASE ap.stage
            WHEN 'qualifying'  THEN 1
            WHEN 'proposal'    THEN 2
            WHEN 'negotiation' THEN 3
          END
        `);

        type ForecastRow = {
          stage: string;
          lead_count: number;
          total_value: string;
          won_count: number;
          terminated_count: number;
        };

        const FALLBACK_RATES: Record<string, number> = {
          qualifying: 0.20,
          proposal: 0.50,
          negotiation: 0.70,
        };
        const MIN_SAMPLE = 5;

        const stageRows = (rows.rows as ForecastRow[]).map((row) => {
          const isFallback = row.terminated_count < MIN_SAMPLE;
          const conversionRate = isFallback
            ? (FALLBACK_RATES[row.stage] ?? 0)
            : row.won_count / row.terminated_count;
          const forecastValue = Number(row.total_value) * conversionRate;
          return {
            stage: row.stage,
            leadCount: row.lead_count,
            pipelineValue: Number(row.total_value),
            conversionRate,
            isFallback,
            forecastValue,
          };
        });

        const totalForecast = stageRows.reduce((sum, s) => sum + s.forecastValue, 0);

        return { totalForecast, stages: stageRows };
      });
    }),

  // =========================================================================
  // dashboardOverview — 5 quick-stat counts for the home page
  // =========================================================================

  dashboardOverview: tenantProcedure
    .query(async ({ ctx }) => {
      return ctx.tenantDb.query(async (db) => {
        const now = new Date();
        const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const dayOfWeek = now.getUTCDay();
        const daysToMonday = (dayOfWeek + 6) % 7;
        const startOfWeek = new Date(startOfToday.getTime() - daysToMonday * 24 * 60 * 60 * 1000);

        const [todayRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .where(and(eq(conversations.tenantId, ctx.tenantId), gte(conversations.createdAt, startOfToday)));

        const [weekRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .where(and(eq(conversations.tenantId, ctx.tenantId), gte(conversations.createdAt, startOfWeek)));

        const [unreadRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(ownerNotifications)
          .where(and(eq(ownerNotifications.tenantId, ctx.tenantId), isNull(ownerNotifications.readAt)));

        const [pendingRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(moduleExecutions)
          .where(and(eq(moduleExecutions.tenantId, ctx.tenantId), eq(moduleExecutions.status, 'pending')));

        const [activeLeadsRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(leads)
          .where(and(
            eq(leads.tenantId, ctx.tenantId),
            not(inArray(leads.stage, ['closed_won', 'closed_lost'])),
          ));

        return {
          todayConversations: todayRow?.count ?? 0,
          weekConversations: weekRow?.count ?? 0,
          unreadNotificationsCount: unreadRow?.count ?? 0,
          pendingApprovalsCount: pendingRow?.count ?? 0,
          activeLeadsCount: activeLeadsRow?.count ?? 0,
        };
      });
    }),

  // =========================================================================
  // dashboardActivityFeed — last 10 cross-artifact events for the home page
  // =========================================================================

  dashboardActivityFeed: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid().optional() }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const notifRows = await db
          .select({
            id: ownerNotifications.id,
            type: ownerNotifications.type,
            title: ownerNotifications.title,
            body: ownerNotifications.body,
            artifactId: ownerNotifications.artifactId,
            artifactName: artifacts.name,
            createdAt: ownerNotifications.createdAt,
          })
          .from(ownerNotifications)
          .innerJoin(artifacts, eq(ownerNotifications.artifactId, artifacts.id))
          .where(and(
            eq(ownerNotifications.tenantId, ctx.tenantId),
            inArray(ownerNotifications.type, ['hot_lead', 'approval_needed', 'deal_closed']),
            input.artifactId ? eq(ownerNotifications.artifactId, input.artifactId) : undefined,
          ))
          .orderBy(desc(ownerNotifications.createdAt))
          .limit(20);

        const convRows = await db
          .select({
            id: conversations.id,
            artifactId: conversations.artifactId,
            artifactName: artifacts.name,
            resolvedAt: conversations.resolvedAt,
          })
          .from(conversations)
          .innerJoin(artifacts, eq(conversations.artifactId, artifacts.id))
          .where(and(
            eq(conversations.tenantId, ctx.tenantId),
            isNotNull(conversations.resolvedAt),
            input.artifactId ? eq(conversations.artifactId, input.artifactId) : undefined,
          ))
          .orderBy(desc(conversations.resolvedAt))
          .limit(20);

        type FeedEventType = 'new_lead' | 'conversation_resolved' | 'approval_needed' | 'deal_closed';

        const notifEvents = notifRows.map((row) => {
          let eventType: FeedEventType;
          if (row.type === 'hot_lead') eventType = 'new_lead';
          else if (row.type === 'approval_needed') eventType = 'approval_needed';
          else eventType = 'deal_closed';
          return {
            id: row.id,
            eventType,
            title: row.title,
            body: row.body,
            artifactId: row.artifactId,
            artifactName: row.artifactName,
            createdAt: row.createdAt,
          };
        });

        const convEvents = convRows.map((row) => ({
          id: `conv_${row.id}`,
          eventType: 'conversation_resolved' as const,
          title: 'Conversation Resolved',
          body: '',
          artifactId: row.artifactId,
          artifactName: row.artifactName,
          createdAt: row.resolvedAt as Date,
        }));

        const allEvents = [...notifEvents, ...convEvents]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, 10);

        return { events: allEvents };
      });
    }),

  exportData: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const LIMIT = 1000;

        // Step 1: Conversations (LIMIT + 1 to detect truncation)
        const convRows = await db
          .select()
          .from(conversations)
          .where(and(eq(conversations.artifactId, input.artifactId), eq(conversations.tenantId, ctx.tenantId)))
          .orderBy(desc(conversations.createdAt))
          .limit(LIMIT + 1);
        const truncatedConvs = convRows.length > LIMIT;
        const exportedConvs = convRows.slice(0, LIMIT);

        // Step 2: Leads (via inArray on exported conv IDs, only if convs non-empty)
        let exportedLeads: typeof leads.$inferSelect[] = [];
        let truncatedLeads = false;
        if (exportedConvs.length > 0) {
          const leadRows = await db
            .select()
            .from(leads)
            .where(and(eq(leads.tenantId, ctx.tenantId), inArray(leads.conversationId, exportedConvs.map((c) => c.id))))
            .orderBy(desc(leads.createdAt))
            .limit(LIMIT + 1);
          truncatedLeads = leadRows.length > LIMIT;
          exportedLeads = leadRows.slice(0, LIMIT);
        }

        // Step 3: Notes (via inArray on exported lead IDs, LIMIT+1 for truncation check)
        let exportedNotes: typeof leadNotes.$inferSelect[] = [];
        let truncatedNotes = false;
        if (exportedLeads.length > 0) {
          const noteRows = await db
            .select()
            .from(leadNotes)
            .where(and(eq(leadNotes.tenantId, ctx.tenantId), inArray(leadNotes.leadId, exportedLeads.map((l) => l.id))))
            .orderBy(desc(leadNotes.createdAt))
            .limit(LIMIT + 1);
          truncatedNotes = noteRows.length > LIMIT;
          exportedNotes = noteRows.slice(0, LIMIT);
        }

        return {
          leads: exportedLeads,
          conversations: exportedConvs,
          notes: exportedNotes,
          truncated: truncatedConvs || truncatedLeads || truncatedNotes,
          exportedAt: new Date(),
        };
      });
    }),

  // =========================================================================
  // performanceMetrics — agent performance dashboard (response time, volume, resolution rate, module usage)
  // =========================================================================

  performanceMetrics: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        function lastNDays(n: number): string[] {
          const days: string[] = [];
          for (let i = n - 1; i >= 0; i--) {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() - i);
            days.push(d.toISOString().slice(0, 10));
          }
          return days;
        }

        // Query 1: rollupRows from artifact_metrics_daily (primary for daily resolution counts)
        const rollupRows = await db
          .select({
            date: sql<string>`${artifactMetricsDaily.metricDate}::text`,
            resolutionsCount: artifactMetricsDaily.resolutionsCount,
          })
          .from(artifactMetricsDaily)
          .where(and(
            eq(artifactMetricsDaily.artifactId, input.artifactId),
            eq(artifactMetricsDaily.tenantId, ctx.tenantId),
            gte(artifactMetricsDaily.metricDate, sql`(now() - interval '30 days')::date`),
          ))
          .orderBy(asc(artifactMetricsDaily.metricDate));

        // Query 2: convRows from conversations (supplement for response time; fallback for missing rollup days)
        const convRows = await db
          .select({
            date: sql<string>`date_trunc('day', ${conversations.createdAt} AT TIME ZONE 'UTC')::date::text`,
            total: sql<number>`COUNT(*)::int`,
            resolved: sql<number>`COUNT(${conversations.resolvedAt})::int`,
            avgResponseMs: sql<number>`COALESCE(AVG(
              CASE WHEN ${conversations.resolvedAt} IS NOT NULL
                THEN EXTRACT(EPOCH FROM (${conversations.resolvedAt} - ${conversations.createdAt})) * 1000
              END
            ), 0)`,
          })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, sql`now() - interval '30 days'`),
          ))
          .groupBy(sql`date_trunc('day', ${conversations.createdAt} AT TIME ZONE 'UTC')::date`)
          .orderBy(asc(sql`date_trunc('day', ${conversations.createdAt} AT TIME ZONE 'UTC')::date`));

        // Query 3: moduleCountRows from module_executions (ALL-TIME, no date filter)
        const moduleCountRows = await db
          .select({
            moduleSlug: moduleExecutions.moduleSlug,
            count: sql<number>`COUNT(*)::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.status, 'executed'),
          ))
          .groupBy(moduleExecutions.moduleSlug)
          .orderBy(desc(sql`COUNT(*)`));

        // Build lookup maps
        const rollupMap = new Map(rollupRows.map(r => [r.date, r]));
        const convMap   = new Map(convRows.map(r => [r.date, r]));

        const days14 = lastNDays(14);
        const days30 = lastNDays(30);

        // Daily response time chart (14d) — always from convMap
        const dailyResponseTime = days14.map(date => ({
          date,
          avgMs: Math.round(convMap.get(date)?.avgResponseMs ?? 0),
        }));

        // Scalar response times — weighted average using unrounded float from convMap
        const window7 = days14.slice(-7);
        const totalResolved7 = window7.reduce((s, d) => s + (convMap.get(d)?.resolved ?? 0), 0);
        const weightedSumMs7 = window7.reduce((s, d) => {
          const e = convMap.get(d);
          return s + (e ? e.avgResponseMs * e.resolved : 0);
        }, 0);
        const avgResponseTime7d = totalResolved7 > 0
          ? Math.round(weightedSumMs7 / totalResolved7)
          : 0;

        const totalResolved30 = days30.reduce((s, d) => s + (convMap.get(d)?.resolved ?? 0), 0);
        const weightedSumMs30 = days30.reduce((s, d) => {
          const e = convMap.get(d);
          return s + (e ? e.avgResponseMs * e.resolved : 0);
        }, 0);
        const avgResponseTime30d = totalResolved30 > 0
          ? Math.round(weightedSumMs30 / totalResolved30)
          : 0;

        // Daily conversation volume (always from convMap.total — rollup has no total count column)
        const dailyConversationVolume = days30.map(date => ({
          date,
          count: convMap.get(date)?.total ?? 0,
        }));

        // Daily resolution rate (numerator prefers rollup; denominator always from convMap.total)
        const dailyResolutionRate = days30.map(date => {
          const total = convMap.get(date)?.total ?? 0;
          // [INTERPRETED]: rollup has no total conversation count column — use convMap.total as denominator
          // Prefer rollup resolutions_count; fall back to convMap.resolved when no rollup row
          const resolutions = rollupMap.has(date)
            ? (rollupMap.get(date)!.resolutionsCount)
            : (convMap.get(date)?.resolved ?? 0);
          return {
            date,
            rate: total > 0 ? Math.round((resolutions / total) * 100) : 0,
          };
        });

        // Module counts
        const moduleExecutionCounts = moduleCountRows.map(r => ({
          slug:  r.moduleSlug,
          count: r.count,
        }));

        return {
          avgResponseTime7d,
          avgResponseTime30d,
          dailyResponseTime,
          dailyConversationVolume,
          dailyResolutionRate,
          moduleExecutionCounts,
        };
      });
    }),

  // =========================================================================
  // customerInsights — top 10 returning customers (>1 conversation) by visit count
  // =========================================================================

  customerInsights: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const result = await db.execute(sql`
          SELECT
            c.id,
            c.name,
            c.email,
            COUNT(conv.id)::int AS conversation_count,
            MAX(conv.created_at) AS last_seen_at,
            (
              SELECT f->>'value'
              FROM jsonb_array_elements(c.memory->'facts') AS f
              WHERE f->>'key' = 'past_topic'
              ORDER BY (f->>'extractedAt') DESC
              LIMIT 1
            ) AS last_topic
          FROM customers c
          INNER JOIN conversations conv
            ON conv.customer_id = c.id
            AND conv.artifact_id = ${input.artifactId}
            AND NOT (conv.metadata @> '{"sandbox": true}'::jsonb)
          WHERE c.tenant_id = ${ctx.tenantId}
          GROUP BY c.id, c.name, c.email, c.memory
          HAVING COUNT(conv.id) > 1
          ORDER BY COUNT(conv.id) DESC
          LIMIT 10
        `);

        return (result.rows as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          name: (r.name as string | null) ?? null,
          email: (r.email as string | null) ?? null,
          conversationCount: Number(r.conversation_count),
          lastSeenAt: new Date(r.last_seen_at as string),
          lastTopic: (r.last_topic as string | null) ?? null,
        }));
      });
    }),

  // =========================================================================
  // moduleStreaks — approval streak per draft_and_approve module (NC-229)
  // =========================================================================

  moduleStreaks: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const draftModules = await db
          .select({ slug: modules.slug })
          .from(artifactModules)
          .innerJoin(modules, eq(artifactModules.moduleId, modules.id))
          .where(and(
            eq(artifactModules.artifactId, input.artifactId),
            eq(artifactModules.tenantId, ctx.tenantId),
            eq(artifactModules.autonomyLevel, 'draft_and_approve'),
          ));

        if (draftModules.length === 0) return [];

        const results = await Promise.all(
          draftModules.map(async ({ slug }) => {
            const execs = await db
              .select({ status: moduleExecutions.status })
              .from(moduleExecutions)
              .where(and(
                eq(moduleExecutions.artifactId, input.artifactId),
                eq(moduleExecutions.tenantId, ctx.tenantId),
                eq(moduleExecutions.moduleSlug, slug),
                inArray(moduleExecutions.status, ['executed', 'rejected']),
              ))
              .orderBy(desc(moduleExecutions.createdAt))
              .limit(20);

            let streak = 0;
            for (const e of execs) {
              if (e.status === 'executed') streak++;
              else break;
            }
            return { moduleSlug: slug, streak };
          }),
        );

        return results;
      });
    }),

});
