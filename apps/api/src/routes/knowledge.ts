import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { knowledgeDocs, tenants } from '@camello/db';
import { ingestKnowledge, IngestionLimitError } from '@camello/ai';
import type { PlanTier, KnowledgeChunk } from '@camello/shared/types';

export const knowledgeRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        sourceType: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [eq(knowledgeDocs.tenantId, ctx.tenantId)];
        if (input.sourceType) conditions.push(eq(knowledgeDocs.sourceType, input.sourceType));

        const rows = await db
          .select({
            id: knowledgeDocs.id,
            title: knowledgeDocs.title,
            sourceType: knowledgeDocs.sourceType,
            chunkIndex: knowledgeDocs.chunkIndex,
            createdAt: knowledgeDocs.createdAt,
            contentPreview: sql<string>`left(${knowledgeDocs.content}, 200)`,
          })
          .from(knowledgeDocs)
          .where(and(...conditions))
          .orderBy(desc(knowledgeDocs.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return rows;
      });
    }),

  ingest: tenantProcedure
    .input(
      z.object({
        content: z.string().min(1),
        title: z.string().optional(),
        sourceType: z.enum(['upload', 'url', 'api']).default('upload'),
        sourceUrl: z.string().url().optional(),
        metadata: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get tenant plan tier for limits
      const tenant = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({ planTier: tenants.planTier })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);
        return rows[0];
      });

      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });

      const planTier = tenant.planTier as PlanTier;

      // Build DI callbacks for ingestKnowledge
      const getIngestionCountToday = async (_tenantId: string) => {
        return ctx.tenantDb.query(async (db) => {
          const rows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(knowledgeDocs)
            .where(
              and(
                eq(knowledgeDocs.tenantId, ctx.tenantId),
                sql`${knowledgeDocs.createdAt} >= now() - interval '1 day'`,
              ),
            );
          return rows[0]?.count ?? 0;
        });
      };

      const insertChunks = async (chunks: KnowledgeChunk[]) => {
        return ctx.tenantDb.query(async (db) => {
          const rows = await db
            .insert(knowledgeDocs)
            .values(
              chunks.map((c) => ({
                tenantId: ctx.tenantId,
                title: c.title ?? input.title ?? null,
                content: c.content,
                sourceType: c.sourceType,
                chunkIndex: c.chunkIndex,
                metadata: c.metadata,
                embedding: c.embedding,
              })),
            )
            .returning({ id: knowledgeDocs.id });
          return rows.map((r) => r.id);
        });
      };

      try {
        const result = await ingestKnowledge({
          content: input.content,
          title: input.title,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          metadata: input.metadata,
          planTier,
          tenantId: ctx.tenantId,
          insertChunks,
          getIngestionCountToday,
        });
        return result;
      } catch (err) {
        if (err instanceof IngestionLimitError) {
          throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: err.message });
        }
        throw err;
      }
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .delete(knowledgeDocs)
          .where(and(eq(knowledgeDocs.id, input.id), eq(knowledgeDocs.tenantId, ctx.tenantId)))
          .returning({ id: knowledgeDocs.id });
        return rows[0] ?? null;
      });
    }),

  deleteByTitle: tenantProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .delete(knowledgeDocs)
          .where(
            and(
              eq(knowledgeDocs.title, input.title),
              eq(knowledgeDocs.tenantId, ctx.tenantId),
            ),
          )
          .returning({ id: knowledgeDocs.id });
        return { deletedCount: rows.length };
      });
    }),
});
