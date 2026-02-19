import { schedules, logger } from "@trigger.dev/sdk/v3";
import { sql } from "drizzle-orm";
import { createTenantDb } from "@camello/db/tenant";
import { servicePool } from "../lib/service-db.js";

/**
 * Daily artifact metrics rollup.
 * Runs at 2 AM UTC, aggregates yesterday's interaction_logs + handoffs
 * into artifact_metrics_daily for dashboard analytics.
 *
 * Date-window semantics: [yesterday 00:00 UTC, today 00:00 UTC) — half-open interval.
 * Both created_at and resolved_at comparisons use this same UTC window.
 * Idempotent via ON CONFLICT DO UPDATE — safe to re-run for the same date.
 */
export const metricsRollupTask = schedules.task({
  id: "artifact-metrics-daily-rollup",
  cron: "0 2 * * *",
  run: async (payload) => {
    // Compute UTC date window from Trigger.dev-provided timestamp
    const today = new Date(payload.timestamp);
    today.setUTCHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    logger.info(`Rolling up metrics for ${dateStr}`);

    // Service-role: enumerate tenants with activity in the date window
    const { rows: tenantRows } = await servicePool.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM interaction_logs
       WHERE created_at >= $1 AND created_at < $2
       UNION
       SELECT DISTINCT tenant_id FROM conversation_artifact_assignments
       WHERE (started_at >= $1 AND started_at < $2)
          OR (ended_at >= $1 AND ended_at < $2)`,
      [yesterday, today]
    );

    logger.info(`Found ${tenantRows.length} tenants with activity`);

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
                AND c.resolved_at >= ${yesterday}
                AND c.resolved_at < ${today}
            ),
            ROUND(AVG(il.latency_ms)::numeric, 2),
            COALESCE(SUM(il.cost_usd), 0)
          FROM interaction_logs il
          JOIN conversations c ON c.id = il.conversation_id
          WHERE il.created_at >= ${yesterday} AND il.created_at < ${today}
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
              AND started_at >= ${yesterday} AND started_at < ${today}
            GROUP BY artifact_id
          ),
          handoff_out AS (
            SELECT artifact_id, COUNT(*) AS cnt
            FROM conversation_artifact_assignments
            WHERE assignment_reason = 'handoff'
              AND ended_at >= ${yesterday} AND ended_at < ${today}
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

      logger.info(`Tenant ${tenantId}: metrics rolled up`);
    }

    return { tenantsProcessed: tenantRows.length, metricDate: dateStr };
  },
});
