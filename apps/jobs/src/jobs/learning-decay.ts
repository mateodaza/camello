import { eq, isNull } from "drizzle-orm";
import { learnings, learningAuditLogs } from "@camello/db/schema";
import { createTenantDb } from "@camello/db/tenant";
import { applyConfidenceDecay } from "@camello/ai/feedback";
import { serviceDb } from "../lib/service-db.js";
import { log } from "../lib/logger.js";

/**
 * Monthly learning confidence decay.
 * Runs on the 1st of every month at 3 AM UTC.
 *
 * For each tenant with active (non-archived) learnings:
 * 1. Enumerate all active learnings via createTenantDb (RLS-scoped)
 * 2. Apply -0.05 confidence decay per learning
 * 3. Archive learnings that drop below 0.3 threshold
 *
 * Guarded by job_runs ledger — safe against double-execution.
 */
export async function runLearningDecay() {
  // Service-role: enumerate tenants with active learnings (bypasses RLS)
  const tenantRows = await serviceDb
    .selectDistinct({ tenantId: learnings.tenantId })
    .from(learnings)
    .where(isNull(learnings.archivedAt));

  log.info(`Found ${tenantRows.length} tenants with active learnings`);

  let totalDecayed = 0;
  let totalArchived = 0;

  for (const { tenantId } of tenantRows) {
    const tdb = createTenantDb(tenantId);

    const result = await applyConfidenceDecay(
      // getActiveLearnings: all non-archived learnings for this tenant
      async () =>
        tdb.query((db) =>
          db
            .select({ id: learnings.id, confidence: learnings.confidence })
            .from(learnings)
            .where(isNull(learnings.archivedAt))
        ).then((rows) =>
          rows.map((r) => ({
            id: r.id,
            confidence: parseFloat(String(r.confidence)),
          }))
        ),

      // updateConfidence: set new confidence + touch updated_at
      async (id, newConfidence) => {
        await tdb.query((db) =>
          db
            .update(learnings)
            .set({
              confidence: String(newConfidence),
              updatedAt: new Date(),
            })
            .where(eq(learnings.id, id))
        );
        await tdb.query((db) =>
          db.insert(learningAuditLogs).values({
            tenantId,
            learningId: id,
            action: "decayed",
            oldConfidence: null,
            newConfidence: String(newConfidence),
          })
        );
      },

      // archiveLearning: mark as archived + touch updated_at
      async (id) => {
        await tdb.query((db) =>
          db
            .update(learnings)
            .set({
              archivedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(learnings.id, id))
        );
        await tdb.query((db) =>
          db.insert(learningAuditLogs).values({
            tenantId,
            learningId: id,
            action: "archived",
            oldConfidence: null,
            newConfidence: "0",
          })
        );
      }
    );

    log.info(`Tenant ${tenantId}: decayed=${result.decayed}, archived=${result.archived}`);
    totalDecayed += result.decayed;
    totalArchived += result.archived;
  }

  const summary = {
    tenantsProcessed: tenantRows.length,
    totalDecayed,
    totalArchived,
  };
  log.info("Learning decay complete", summary);
  return summary;
}
