import { eq, and, gte, lt, desc, count, sum } from 'drizzle-orm';
import type { TenantDb } from '@camello/db';
import {
  conversations,
  payments,
  leads,
  ownerNotifications,
  moduleExecutions,
} from '@camello/db';

export interface AdvisorSnapshot {
  activeConversations: number;
  conversationTrend: number;           // signed integer %, e.g. +33 or -10
  pendingPayments: {
    count: number;
    // Per-currency totals — avoids incorrect cross-currency aggregation.
    byCurrency: Array<{ currency: string; totalAmount: number }>;
  };
  paidPayments:    { count: number; totalAmount: number };
  leadsByStage: Record<string, number>;
  topKnowledgeGaps: string[];          // up to 3 intentType strings
  pendingApprovals: number;
  recentExecutions: { slug: string; count: number }[];
}

export async function fetchAdvisorSnapshot(
  tenantDb: TenantDb,
  tenantId: string,
): Promise<AdvisorSnapshot> {
  return tenantDb.query(async (db) => {
    const now = new Date();
    const minus7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const minus14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const minus30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      activeConvRows,
      priorConvRows,
      pendingByCurrencyRows,
      paidPayRows,
      leadRows,
      gapRows,
      approvalRows,
      execRows,
    ] = await Promise.all([
      db.select({ count: count() })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), gte(conversations.updatedAt, minus7d))),

      db.select({ count: count() })
        .from(conversations)
        .where(and(
          eq(conversations.tenantId, tenantId),
          gte(conversations.updatedAt, minus14d),
          lt(conversations.updatedAt, minus7d),
        )),

      // Group pending payments by currency — prevents incorrect cross-currency aggregation.
      // A single-currency sum under an arbitrary currency label is misleading for multi-currency tenants.
      db.select({ currency: payments.currency, count: count(), totalAmount: sum(payments.amount) })
        .from(payments)
        .where(and(eq(payments.tenantId, tenantId), eq(payments.status, 'pending')))
        .groupBy(payments.currency),

      db.select({ count: count(), totalAmount: sum(payments.amount) })
        .from(payments)
        .where(and(eq(payments.tenantId, tenantId), eq(payments.status, 'paid'))),

      db.select({ stage: leads.stage, count: count() })
        .from(leads)
        .where(eq(leads.tenantId, tenantId))
        .groupBy(leads.stage),

      // Fetch all gap notifications and aggregate intentType in JS to avoid
      // the Drizzle sql`` tag, which produces malformed SQL when bundled with tsup noExternal.
      db.select({ metadata: ownerNotifications.metadata })
        .from(ownerNotifications)
        .where(and(
          eq(ownerNotifications.tenantId, tenantId),
          eq(ownerNotifications.type, 'knowledge_gap'),
          gte(ownerNotifications.createdAt, minus30d),
        )),

      db.select({ count: count() })
        .from(moduleExecutions)
        .where(and(eq(moduleExecutions.tenantId, tenantId), eq(moduleExecutions.status, 'pending'))),

      db.select({ slug: moduleExecutions.moduleSlug, count: count() })
        .from(moduleExecutions)
        .where(and(eq(moduleExecutions.tenantId, tenantId), gte(moduleExecutions.createdAt, minus7d)))
        .groupBy(moduleExecutions.moduleSlug)
        .orderBy(desc(count()))
        .limit(10),
    ]);

    const currentCount = activeConvRows[0]?.count ?? 0;
    const priorCount   = priorConvRows[0]?.count ?? 0;
    const trend = priorCount === 0
      ? (currentCount > 0 ? 100 : 0)
      : Math.round(((currentCount - priorCount) / priorCount) * 100);

    const leadsByStage: Record<string, number> = {};
    for (const row of leadRows) {
      leadsByStage[row.stage] = row.count;
    }

    // Aggregate intentType counts in JS (avoids Drizzle sql`` tag in bundled code).
    const intentCounts = new Map<string, number>();
    for (const row of gapRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intentType = (row.metadata as any)?.intentType as string | undefined;
      if (intentType) intentCounts.set(intentType, (intentCounts.get(intentType) ?? 0) + 1);
    }
    const topKnowledgeGaps = [...intentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([intentType]) => intentType);

    const totalPendingCount = pendingByCurrencyRows.reduce((acc, r) => acc + r.count, 0);

    return {
      activeConversations: currentCount,
      conversationTrend: trend,
      pendingPayments: {
        count: totalPendingCount,
        byCurrency: pendingByCurrencyRows.map((r) => ({
          currency: r.currency,
          totalAmount: parseFloat(r.totalAmount ?? '0'),
        })),
      },
      paidPayments: {
        count: paidPayRows[0]?.count ?? 0,
        totalAmount: parseFloat(paidPayRows[0]?.totalAmount ?? '0'),
      },
      leadsByStage,
      topKnowledgeGaps,
      pendingApprovals: approvalRows[0]?.count ?? 0,
      recentExecutions: execRows.map((r) => ({ slug: r.slug, count: r.count })),
    };
  });
}
