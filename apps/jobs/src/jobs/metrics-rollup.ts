import { sql } from "drizzle-orm";
import { createTenantDb } from "@camello/db/tenant";
import { servicePool } from "../lib/service-db.js";
import { log } from "../lib/logger.js";

/**
 * Daily artifact metrics rollup.
 * Aggregates interaction_logs + handoffs into artifact_metrics_daily.
 *
 * @param metricDate - The date to roll up (caller computes this — typically yesterday).
 *   Window: [metricDate 00:00 UTC, metricDate+1day 00:00 UTC) — half-open interval.
 *   Idempotent via ON CONFLICT DO UPDATE — safe to re-run for the same date.
 */
export async function runMetricsRollup(metricDate: Date) {
  const windowStart = new Date(metricDate);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
  const dateStr = windowStart.toISOString().slice(0, 10);

  log.info(`Rolling up metrics for ${dateStr}`);

  // Service-role: enumerate tenants with activity in the date window
  const { rows: tenantRows } = await servicePool.query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM interaction_logs
     WHERE created_at >= $1 AND created_at < $2
     UNION
     SELECT DISTINCT tenant_id FROM conversation_artifact_assignments
     WHERE (started_at >= $1 AND started_at < $2)
        OR (ended_at >= $1 AND ended_at < $2)`,
    [windowStart, windowEnd]
  );

  log.info(`Found ${tenantRows.length} tenants with activity`);

  for (const { tenant_id: tenantId } of tenantRows) {
    const tdb = createTenantDb(tenantId);

    // Step 1: Interaction metrics — INSERT ... ON CONFLICT UPDATE
    await tdb.query(async (db) => {
      await db.execute(sql`
        INSERT INTO artifact_metrics_daily
          (tenant_id, artifact_id, metric_date, resolutions_count, avg_latency_ms, llm_cost_usd)
        SELECT
          il.tenant_id,
          il.artifact_id,
          ${dateStr}::date,
          COUNT(DISTINCT il.conversation_id) FILTER (
            WHERE c.status = 'resolved'
              AND c.resolved_at >= ${windowStart}
              AND c.resolved_at < ${windowEnd}
          ),
          ROUND(AVG(il.latency_ms)::numeric, 2),
          COALESCE(SUM(il.cost_usd), 0)
        FROM interaction_logs il
        JOIN conversations c ON c.id = il.conversation_id
        WHERE il.created_at >= ${windowStart} AND il.created_at < ${windowEnd}
        GROUP BY il.tenant_id, il.artifact_id
        ON CONFLICT (tenant_id, artifact_id, metric_date) DO UPDATE SET
          resolutions_count = EXCLUDED.resolutions_count,
          avg_latency_ms    = EXCLUDED.avg_latency_ms,
          llm_cost_usd      = EXCLUDED.llm_cost_usd
      `);
    });

    // Step 2: Handoff counts
    // Artifacts with handoffs but no interaction_logs need an UPSERT too
    await tdb.query(async (db) => {
      await db.execute(sql`
        WITH handoff_in AS (
          SELECT artifact_id, COUNT(*) AS cnt
          FROM conversation_artifact_assignments
          WHERE assignment_reason = 'handoff'
            AND started_at >= ${windowStart} AND started_at < ${windowEnd}
          GROUP BY artifact_id
        ),
        handoff_out AS (
          SELECT artifact_id, COUNT(*) AS cnt
          FROM conversation_artifact_assignments
          WHERE assignment_reason = 'handoff'
            AND ended_at >= ${windowStart} AND ended_at < ${windowEnd}
          GROUP BY artifact_id
        ),
        combined AS (
          SELECT
            COALESCE(hi.artifact_id, ho.artifact_id) AS artifact_id,
            COALESCE(hi.cnt, 0) AS handoffs_in,
            COALESCE(ho.cnt, 0) AS handoffs_out
          FROM handoff_in hi
          FULL OUTER JOIN handoff_out ho ON hi.artifact_id = ho.artifact_id
        )
        INSERT INTO artifact_metrics_daily
          (tenant_id, artifact_id, metric_date, handoffs_in, handoffs_out,
           resolutions_count, avg_latency_ms, llm_cost_usd)
        SELECT
          ${tenantId}::uuid,
          c.artifact_id,
          ${dateStr}::date,
          c.handoffs_in,
          c.handoffs_out,
          0, 0, 0
        FROM combined c
        ON CONFLICT (tenant_id, artifact_id, metric_date) DO UPDATE SET
          handoffs_in  = EXCLUDED.handoffs_in,
          handoffs_out = EXCLUDED.handoffs_out
      `);
    });

    log.info(`Tenant ${tenantId}: metrics rolled up`);
  }

  return { tenantsProcessed: tenantRows.length, metricDate: dateStr };
}
