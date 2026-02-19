import { schedules, logger } from "@trigger.dev/sdk/v3";
import { sql, eq } from "drizzle-orm";
import { knowledgeDocs, knowledgeSyncs, tenants } from "@camello/db/schema";
import { createTenantDb } from "@camello/db/tenant";
import { ingestKnowledge } from "@camello/ai/ingestion";
import type { PlanTier, KnowledgeChunk } from "@camello/shared/types";
import { serviceDb, servicePool } from "../lib/service-db.js";
import { extractContent, SsrfError } from "../lib/content-extractor.js";

const MAX_RETRIES = 3;
const STALE_PROCESSING_MINUTES = 10;

interface ClaimedRow {
  id: string;
  tenant_id: string;
  source_url: string;
  source_type: string;
  attempt_count: number;
}

/**
 * URL-drop knowledge ingestion (polling cron).
 * Runs every 5 minutes, claims up to 5 pending knowledge_syncs rows
 * using FOR UPDATE SKIP LOCKED for race-safe concurrent processing.
 *
 * Retry logic:
 * - attempt_count < 3 → failure resets to 'pending' for retry
 * - attempt_count >= 3 → permanent 'failed' (manual retry via dashboard)
 * - Stale 'processing' rows (>10 min) are reclaimed automatically
 */
export const urlIngestionTask = schedules.task({
  id: "url-drop-knowledge-ingestion",
  cron: "*/5 * * * *",
  run: async () => {
    // Atomic claim: FOR UPDATE SKIP LOCKED prevents double-processing
    const { rows: claimed } = await servicePool.query<ClaimedRow>(
      `UPDATE knowledge_syncs
       SET status = 'processing',
           attempt_count = attempt_count + 1,
           processing_started_at = NOW(),
           updated_at = NOW()
       WHERE id IN (
         SELECT id FROM knowledge_syncs
         WHERE status = 'pending'
            OR (status = 'processing'
                AND processing_started_at < NOW() - INTERVAL '${STALE_PROCESSING_MINUTES} minutes')
         ORDER BY created_at
         LIMIT 5
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, tenant_id, source_url, source_type, attempt_count`
    );

    if (claimed.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    logger.info(`Claimed ${claimed.length} sync rows`);

    let succeeded = 0;
    let failed = 0;

    for (const row of claimed) {
      try {
        // Fetch plan_tier for ingestion limits (service-role — cross-tenant)
        const [tenant] = await serviceDb
          .select({ planTier: tenants.planTier })
          .from(tenants)
          .where(eq(tenants.id, row.tenant_id))
          .limit(1);

        if (!tenant) {
          throw new Error(`Tenant ${row.tenant_id} not found`);
        }

        // Fetch + extract content (SSRF-safe)
        const content = await extractContent(row.source_url);

        // Ingest via createTenantDb (RLS-scoped)
        const tdb = createTenantDb(row.tenant_id);
        await ingestKnowledge({
          tenantId: row.tenant_id,
          planTier: tenant.planTier as PlanTier,
          content,
          title: row.source_url,
          sourceType: 'url',
          sourceUrl: row.source_url,
          insertChunks: async (chunks: KnowledgeChunk[]) =>
            tdb.query(async (db) => {
              const ids: string[] = [];
              for (const chunk of chunks) {
                const [inserted] = await db
                  .insert(knowledgeDocs)
                  .values({
                    tenantId: row.tenant_id,
                    title: chunk.title,
                    content: chunk.content,
                    sourceType: chunk.sourceType,
                    chunkIndex: chunk.chunkIndex,
                    metadata: chunk.metadata,
                    embedding: chunk.embedding,
                  })
                  .returning({ id: knowledgeDocs.id });
                ids.push(inserted.id);
              }
              return ids;
            }),
          getIngestionCountToday: async (_tid: string) =>
            tdb.query(async (db) => {
              const todayStart = new Date();
              todayStart.setUTCHours(0, 0, 0, 0);
              const [result] = await db
                .select({ count: sql<number>`count(*)` })
                .from(knowledgeDocs)
                .where(sql`created_at >= ${todayStart}`);
              return Number(result?.count ?? 0);
            }),
        });

        // Success: mark as synced (service-role)
        await serviceDb
          .update(knowledgeSyncs)
          .set({
            status: 'synced',
            lastSynced: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeSyncs.id, row.id));

        logger.info(`Synced: ${row.source_url}`);
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isPermanentFail =
          row.attempt_count >= MAX_RETRIES ||
          err instanceof SsrfError; // SSRF errors are not retryable

        await serviceDb
          .update(knowledgeSyncs)
          .set({
            status: isPermanentFail ? 'failed' : 'pending',
            lastError: message,
            processingStartedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeSyncs.id, row.id));

        logger.error(`Failed (attempt ${row.attempt_count}/${MAX_RETRIES}): ${row.source_url} — ${message}`);
        failed++;
      }
    }

    const summary = { processed: claimed.length, succeeded, failed };
    logger.info("URL ingestion complete", summary);
    return summary;
  },
});
