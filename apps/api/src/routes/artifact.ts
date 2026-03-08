import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { artifacts, artifactModules, modules, tenants } from '@camello/db';
import { enforceUniqueArtifactType } from '../lib/enforce-unique-artifact-type.js';
import { applyArchetypeDefaults } from '../lib/apply-archetype-defaults.js';
import { validatePersonality, PERSONALITY_VALIDATION_MESSAGE } from '../lib/personality-validator.js';
import { ARCHETYPE_DEFAULT_TONES } from '@camello/ai';
import type { ArtifactType } from '@camello/shared/types';

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
        personality: z.record(z.unknown()).default({}).refine(validatePersonality, { message: PERSONALITY_VALIDATION_MESSAGE }),
        constraints: z.record(z.unknown()).default({}),
        config: z.record(z.unknown()).default({}),
        escalation: z.record(z.unknown()).default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.transaction(async (tx) => {
        await enforceUniqueArtifactType(tx, ctx.tenantId, input.type);

        // Resolve tenant locale for archetype defaults
        const [tenantRow] = await tx
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);
        const locale = ((tenantRow?.settings as Record<string, unknown>)?.preferredLocale === 'es' ? 'es' : 'en') as 'en' | 'es';

        // Apply archetype defaults for empty fields
        const p = input.personality as Record<string, unknown>;
        const archetypeType = input.type as ArtifactType;
        if (!p.tone) {
          const defaultTone = ARCHETYPE_DEFAULT_TONES[archetypeType][locale];
          if (defaultTone) p.tone = defaultTone;
        }

        const rows = await tx
          .insert(artifacts)
          .values({ ...input, personality: p, tenantId: ctx.tenantId })
          .returning();

        // Auto-bind archetype-specific modules
        await applyArchetypeDefaults(tx, rows[0].id, ctx.tenantId, archetypeType);

        return rows[0];
      });
    }),

  update: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        type: z.enum(['sales', 'support', 'marketing', 'custom']).optional(),
        personality: z.record(z.unknown()).optional().refine(
          (val) => !val || validatePersonality(val),
          { message: PERSONALITY_VALIDATION_MESSAGE },
        ),
        constraints: z.record(z.unknown()).optional(),
        config: z.record(z.unknown()).optional(),
        escalation: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.tenantDb.transaction(async (tx) => {
        // If type is being changed, enforce uniqueness
        if (input.type) {
          await enforceUniqueArtifactType(tx, ctx.tenantId, input.type, id);
        }

        // Server-side personality MERGE (not replace)
        if (data.personality) {
          const [current] = await tx
            .select({ personality: artifacts.personality })
            .from(artifacts)
            .where(and(eq(artifacts.id, id), eq(artifacts.tenantId, ctx.tenantId)))
            .limit(1);

          if (current) {
            const existing = (current.personality as Record<string, unknown>) ?? {};
            data.personality = { ...existing, ...data.personality };
          }
        }

        const rows = await tx
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

  deactivate: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .update(artifacts)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(artifacts.id, input.id), eq(artifacts.tenantId, ctx.tenantId)))
          .returning();
        if (!rows[0]) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Artifact not found' });
        }
        return rows[0];
      });
    }),

  // --- Module bindings ---

  listModules: tenantProcedure
    .input(z.object({ artifactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: artifactModules.id,
            artifactId: artifactModules.artifactId,
            moduleId: artifactModules.moduleId,
            autonomyLevel: artifactModules.autonomyLevel,
            configOverrides: artifactModules.configOverrides,
            moduleName: modules.name,
            moduleSlug: modules.slug,
            moduleCategory: modules.category,
          })
          .from(artifactModules)
          .innerJoin(modules, eq(artifactModules.moduleId, modules.id))
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
            set: { autonomyLevel: input.autonomyLevel, configOverrides: input.configOverrides, autonomySource: 'manual' },
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
