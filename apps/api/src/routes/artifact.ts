import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { artifacts, artifactModules } from '@camello/db';

export const artifactRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        type: z.enum(['sales', 'support', 'marketing', 'custom']).optional(),
        activeOnly: z.boolean().default(true),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [eq(artifacts.tenantId, ctx.tenantId)];
        if (input.activeOnly) conditions.push(eq(artifacts.isActive, true));
        if (input.type) conditions.push(eq(artifacts.type, input.type));

        return db
          .select()
          .from(artifacts)
          .where(and(...conditions))
          .orderBy(desc(artifacts.createdAt));
      });
    }),

  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.id, input.id), eq(artifacts.tenantId, ctx.tenantId)))
          .limit(1);
        return rows[0] ?? null;
      });
    }),

  create: tenantProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        type: z.enum(['sales', 'support', 'marketing', 'custom']),
        personality: z.record(z.unknown()).default({}),
        constraints: z.record(z.unknown()).default({}),
        config: z.record(z.unknown()).default({}),
        escalation: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .insert(artifacts)
          .values({ ...input, tenantId: ctx.tenantId })
          .returning();
        return rows[0];
      });
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        type: z.enum(['sales', 'support', 'marketing', 'custom']).optional(),
        personality: z.record(z.unknown()).optional(),
        constraints: z.record(z.unknown()).optional(),
        config: z.record(z.unknown()).optional(),
        escalation: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .update(artifacts)
          .set({ ...data, updatedAt: new Date() })
          .where(and(eq(artifacts.id, id), eq(artifacts.tenantId, ctx.tenantId)))
          .returning();
        return rows[0] ?? null;
      });
    }),

  delete: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .delete(artifacts)
          .where(and(eq(artifacts.id, input.id), eq(artifacts.tenantId, ctx.tenantId)))
          .returning({ id: artifacts.id });
        return rows[0] ?? null;
      });
    }),

  // --- Module bindings ---

  listModules: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select()
          .from(artifactModules)
          .where(
            and(
              eq(artifactModules.artifactId, input.artifactId),
              eq(artifactModules.tenantId, ctx.tenantId),
            ),
          );
      });
    }),

  attachModule: tenantProcedure
    .input(
      z.object({
        artifactId: z.string().uuid(),
        moduleId: z.string().uuid(),
        autonomyLevel: z.enum(['suggest_only', 'draft_and_approve', 'fully_autonomous']).default('draft_and_approve'),
        configOverrides: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .insert(artifactModules)
          .values({ ...input, tenantId: ctx.tenantId })
          .onConflictDoUpdate({
            target: [artifactModules.artifactId, artifactModules.moduleId],
            set: { autonomyLevel: input.autonomyLevel, configOverrides: input.configOverrides },
          })
          .returning();
        return rows[0];
      });
    }),

  detachModule: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid(), moduleId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .delete(artifactModules)
          .where(
            and(
              eq(artifactModules.artifactId, input.artifactId),
              eq(artifactModules.moduleId, input.moduleId),
              eq(artifactModules.tenantId, ctx.tenantId),
            ),
          )
          .returning({ id: artifactModules.id });
        return rows[0] ?? null;
      });
    }),
});
