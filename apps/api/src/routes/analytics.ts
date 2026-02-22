import { z } from 'zod';
import { eq, and, sql, gte, lte, lt, desc } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import {
  artifactMetricsDaily,
  conversations,
  interactionLogs,
  usageRecords,
} from '@camello/db';
import { getUtcMonthWindow } from '../lib/date-utils.js';

export const analyticsRouter = router({
  /** Daily metrics for a specific artifact (date range). */
  artifactMetrics: tenantProcedure
    .input(
      z.object({
        artifactId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select()
          .from(artifactMetricsDaily)
          .where(
            and(
              eq(artifactMetricsDaily.tenantId, ctx.tenantId),
              eq(artifactMetricsDaily.artifactId, input.artifactId),
              gte(artifactMetricsDaily.metricDate, input.from),
              lte(artifactMetricsDaily.metricDate, input.to),
            ),
          )
          .orderBy(artifactMetricsDaily.metricDate);
      });
    }),

  /** Tenant-wide overview stats. */
  overview: tenantProcedure
    .input(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Conversation counts by status
        const conversationStats = await db
          .select({
            status: conversations.status,
            count: sql<number>`count(*)::int`,
          })
          .from(conversations)
          .where(
            and(
              eq(conversations.tenantId, ctx.tenantId),
              gte(conversations.createdAt, sql`${input.from}::timestamptz`),
              lte(conversations.createdAt, sql`${input.to}::timestamptz + interval '1 day'`),
            ),
          )
          .groupBy(conversations.status);

        // Total LLM cost for the period
        const costRows = await db
          .select({
            totalCost: sql<string>`coalesce(sum(cost_usd), 0)`,
            totalTokensIn: sql<number>`coalesce(sum(tokens_in), 0)::int`,
            totalTokensOut: sql<number>`coalesce(sum(tokens_out), 0)::int`,
            totalInteractions: sql<number>`count(*)::int`,
          })
          .from(interactionLogs)
          .where(
            and(
              eq(interactionLogs.tenantId, ctx.tenantId),
              gte(interactionLogs.createdAt, sql`${input.from}::timestamptz`),
              lte(interactionLogs.createdAt, sql`${input.to}::timestamptz + interval '1 day'`),
            ),
          );

        return {
          conversations: Object.fromEntries(conversationStats.map((r) => [r.status, r.count])),
          cost: costRows[0] ?? { totalCost: '0', totalTokensIn: 0, totalTokensOut: 0, totalInteractions: 0 },
        };
      });
    }),

  /** Recent interaction logs for debugging/monitoring. */
  recentLogs: tenantProcedure
    .input(
      z.object({
        artifactId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [eq(interactionLogs.tenantId, ctx.tenantId)];
        if (input.artifactId) conditions.push(eq(interactionLogs.artifactId, input.artifactId));

        return db
          .select()
          .from(interactionLogs)
          .where(and(...conditions))
          .orderBy(desc(interactionLogs.createdAt))
          .limit(input.limit);
      });
    }),

  /** Current month usage for plan usage bars. Uses UTC month boundaries matching budget gate. */
  monthlyUsage: tenantProcedure
    .query(async ({ ctx }) => {
      const { monthStart, nextMonthStart } = getUtcMonthWindow(new Date());

      return ctx.tenantDb.query(async (db) => {
        const resolvedRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .where(
            and(
              eq(conversations.tenantId, ctx.tenantId),
              gte(conversations.resolvedAt, monthStart),
              lt(conversations.resolvedAt, nextMonthStart),
            ),
          );

        const costRows = await db
          .select({ totalCost: sql<string>`coalesce(sum(cost_usd), 0)` })
          .from(interactionLogs)
          .where(
            and(
              eq(interactionLogs.tenantId, ctx.tenantId),
              gte(interactionLogs.createdAt, monthStart),
              lt(interactionLogs.createdAt, nextMonthStart),
            ),
          );

        return {
          resolvedThisMonth: resolvedRows[0]?.count ?? 0,
          costThisMonth: parseFloat(costRows[0]?.totalCost ?? '0'),
        };
      });
    }),

  /** Usage records (billing periods). */
  usage: tenantProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(24).default(6),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select()
          .from(usageRecords)
          .where(eq(usageRecords.tenantId, ctx.tenantId))
          .orderBy(desc(usageRecords.periodStart))
          .limit(input.limit);
      });
    }),
});
