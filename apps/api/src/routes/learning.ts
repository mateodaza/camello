import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { learnings, learningAuditLogs } from '@camello/db';

export const learningRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        artifactId: z.string().uuid().optional(),
        sourceModuleSlug: z.string().min(1).optional(),
        includeArchived: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(100),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [eq(learnings.tenantId, ctx.tenantId)];
        if (input.artifactId) conditions.push(eq(learnings.artifactId, input.artifactId));
        if (input.sourceModuleSlug) conditions.push(eq(learnings.sourceModuleSlug, input.sourceModuleSlug));
        if (!input.includeArchived) conditions.push(isNull(learnings.archivedAt));

        return db
          .select()
          .from(learnings)
          .where(and(...conditions))
          .orderBy(desc(learnings.updatedAt))
          .limit(input.limit);
      });
    }),

  dismiss: tenantProcedure
    .input(z.object({ learningId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const [updated] = await db
          .update(learnings)
          .set({
            confidence: '0',
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(learnings.id, input.learningId),
              eq(learnings.tenantId, ctx.tenantId),
            ),
          )
          .returning({
            id: learnings.id,
            oldConfidence: learnings.confidence,
          });

        if (!updated) return null;

        await db.insert(learningAuditLogs).values({
          tenantId: ctx.tenantId,
          learningId: updated.id,
          action: 'dismissed',
          performedBy: ctx.userId,
          oldConfidence: updated.oldConfidence,
          newConfidence: '0',
        });

        return { id: updated.id };
      });
    }),

  boost: tenantProcedure
    .input(z.object({ learningId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const [updated] = await db
          .update(learnings)
          .set({
            confidence: '1.0',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(learnings.id, input.learningId),
              eq(learnings.tenantId, ctx.tenantId),
            ),
          )
          .returning({
            id: learnings.id,
            oldConfidence: learnings.confidence,
          });

        if (!updated) return null;

        await db.insert(learningAuditLogs).values({
          tenantId: ctx.tenantId,
          learningId: updated.id,
          action: 'boosted',
          performedBy: ctx.userId,
          oldConfidence: updated.oldConfidence,
          newConfidence: '1.0',
        });

        return { id: updated.id };
      });
    }),

  bulkClearByModule: tenantProcedure
    .input(z.object({ sourceModuleSlug: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const targets = await db
          .select({
            id: learnings.id,
            oldConfidence: learnings.confidence,
          })
          .from(learnings)
          .where(
            and(
              eq(learnings.tenantId, ctx.tenantId),
              eq(learnings.sourceModuleSlug, input.sourceModuleSlug),
              isNull(learnings.archivedAt),
            ),
          );

        if (targets.length === 0) return { clearedCount: 0 };

        const targetIds = targets.map((t) => t.id);
        await db
          .update(learnings)
          .set({
            confidence: '0',
            archivedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(inArray(learnings.id, targetIds));

        await db.insert(learningAuditLogs).values(
          targets.map((t) => ({
            tenantId: ctx.tenantId,
            learningId: t.id,
            action: 'bulk_cleared',
            performedBy: ctx.userId,
            oldConfidence: t.oldConfidence,
            newConfidence: '0',
          })),
        );

        return { clearedCount: targetIds.length };
      });
    }),
});
