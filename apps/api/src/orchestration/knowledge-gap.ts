import { and, eq, gte } from 'drizzle-orm';
import type { TenantDb } from '@camello/db';
import { ownerNotifications } from '@camello/db';

export const TRIVIAL_INTENTS = new Set<string>(['greeting', 'farewell', 'thanks']);

export async function recordKnowledgeGap(
  tenantDb: TenantDb,
  tenantId: string,
  artifactId: string,
  intentType: string,
  customerMessage: string,
): Promise<void> {
  if (TRIVIAL_INTENTS.has(intentType)) return;

  const truncated = customerMessage.slice(0, 200);
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    await tenantDb.query(async (db) => {
      // Spec-mandated: query before inserting.
      // Fetch all knowledge_gap rows for this artifact in the last 24h and
      // check in JS to avoid sql tag (CLAUDE.md tsup bundling guardrail).
      const recentGaps = await db
        .select({ metadata: ownerNotifications.metadata })
        .from(ownerNotifications)
        .where(
          and(
            eq(ownerNotifications.artifactId, artifactId),
            eq(ownerNotifications.type, 'knowledge_gap'),
            gte(ownerNotifications.createdAt, windowStart),
          ),
        );

      const alreadyExists = recentGaps.some(
        (row) =>
          (row.metadata as { intentType?: string } | null)?.intentType === intentType,
      );
      if (alreadyExists) return;

      // onConflictDoNothing() is the atomic safety net for concurrent requests:
      // two concurrent calls may both pass the SELECT check above under READ COMMITTED,
      // but only one INSERT will succeed; the other is a silent no-op via the
      // owner_notifications_knowledge_gap_daily_dedup unique index.
      await db
        .insert(ownerNotifications)
        .values({
          tenantId,
          artifactId,
          type: 'knowledge_gap',
          title: `Knowledge gap: ${intentType}`,
          body: `Customer asked: "${truncated}" — no knowledge base content matched for intent: ${intentType}.`,
          metadata: { intentType, sampleQuestion: truncated },
        })
        .onConflictDoNothing();
    });
  } catch (err) {
    console.warn(
      '[handleMessage] knowledge gap recording failed (non-blocking):',
      err instanceof Error ? err.message : String(err),
    );
  }
}
