import { z } from 'zod';
import { router, tenantProcedure } from '../trpc/init.js';
import { tenants } from '@camello/db';
import { eq, sql } from 'drizzle-orm';
import { artifactRouter } from './artifact.js';
import { conversationRouter } from './conversation.js';
import { knowledgeRouter } from './knowledge.js';
import { moduleRouter } from './module.js';
import { learningRouter } from './learning.js';
import { channelRouter } from './channel.js';
import { analyticsRouter } from './analytics.js';
import { chatRouter } from './chat.js';
import { onboardingRouter } from './onboarding.js';
import { billingRouter } from './billing.js';

export const tenantRouter = router({
  /** Get current tenant info. Requires auth + tenant context. */
  me: tenantProcedure.query(async ({ ctx }) => {
    const result = await ctx.tenantDb.query(async (db) => {
      return db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    });
    return result[0] ?? null;
  }),

  /** Sync tenant display name (e.g. when Clerk org name changes). */
  updateName: tenantProcedure
    .input(z.object({ name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tenantDb.query(async (db) => {
        await db.update(tenants)
          .set({ name: input.name })
          .where(eq(tenants.id, ctx.tenantId));
      });
      return { name: input.name };
    }),

  /** Update tenant preferred locale. */
  updateLocale: tenantProcedure
    .input(z.object({ locale: z.enum(['en', 'es']) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tenantDb.query(async (db) => {
        await db.update(tenants)
          .set({ settings: sql`jsonb_set(COALESCE(settings, '{}'), '{preferredLocale}', ${JSON.stringify(input.locale)}::jsonb)` })
          .where(eq(tenants.id, ctx.tenantId));
      });
      return { locale: input.locale };
    }),

  /** Update tenant public profile (business card). Merge semantics — omitted fields preserved. */
  updateProfile: tenantProcedure
    .input(z.object({
      tagline: z.string().max(50).optional(),
      bio: z.string().max(150).optional(),
      avatarUrl: z.string().url().max(500).refine((u) => u.startsWith('https://'), { message: 'Must be HTTPS' }).optional().or(z.literal('')),
      location: z.string().max(50).optional(),
      hours: z.string().max(50).optional(),
      socialLinks: z.array(z.object({
        platform: z.string().max(30),
        url: z.string().url().max(500).refine((u) => u.startsWith('https://'), { message: 'Must be HTTPS' }),
      })).max(6).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Read existing settings → merge profile patch
      const existing = await ctx.tenantDb.query(async (db) => {
        const rows = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
        return rows[0]?.settings as Record<string, unknown> | null;
      });
      const existingProfile = (existing?.profile as Record<string, unknown>) ?? {};
      const merged = { ...existingProfile };
      if (input.tagline !== undefined) merged.tagline = input.tagline;
      if (input.bio !== undefined) merged.bio = input.bio;
      if (input.avatarUrl !== undefined) merged.avatarUrl = input.avatarUrl || null;
      if (input.location !== undefined) merged.location = input.location;
      if (input.hours !== undefined) merged.hours = input.hours;
      if (input.socialLinks !== undefined) merged.socialLinks = input.socialLinks;

      await ctx.tenantDb.query(async (db) => {
        await db.update(tenants)
          .set({ settings: sql`jsonb_set(COALESCE(settings, '{}'), '{profile}', ${JSON.stringify(merged)}::jsonb)` })
          .where(eq(tenants.id, ctx.tenantId));
      });
      return merged;
    }),
});

export const appRouter = router({
  tenant: tenantRouter,
  artifact: artifactRouter,
  module: moduleRouter,
  learning: learningRouter,
  conversation: conversationRouter,
  knowledge: knowledgeRouter,
  channel: channelRouter,
  analytics: analyticsRouter,
  chat: chatRouter,
  onboarding: onboardingRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
