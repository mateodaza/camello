import { z } from 'zod';
import { TRPCError } from '@trpc/server';
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
import { uploadAvatar } from '../lib/supabase-storage.js';

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

  /** Upload avatar image to Supabase Storage and update profile. */
  uploadAvatar: tenantProcedure
    .input(z.object({
      /** Base64-encoded file content (no data URI prefix) */
      base64: z.string().min(1).max(4_000_000), // ~3 MB base64 ≈ 2 MB binary
      contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
    }))
    .mutation(async ({ ctx, input }) => {
      let publicUrl: string;
      try {
        publicUrl = await uploadAvatar(ctx.tenantId, input.base64, input.contentType);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Avatar upload failed';
        const isValidation = msg.includes('Unsupported content type') || msg.includes('File too large');
        throw new TRPCError({
          code: isValidation ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
          message: isValidation ? msg : 'Avatar upload failed',
        });
      }

      // Update profile.avatarUrl in tenant settings
      const existing = await ctx.tenantDb.query(async (db) => {
        const rows = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
        return rows[0]?.settings as Record<string, unknown> | null;
      });
      const existingProfile = (existing?.profile as Record<string, unknown>) ?? {};
      const merged = { ...existingProfile, avatarUrl: publicUrl };

      await ctx.tenantDb.query(async (db) => {
        await db.update(tenants)
          .set({ settings: sql`jsonb_set(COALESCE(settings, '{}'), '{profile}', ${JSON.stringify(merged)}::jsonb)` })
          .where(eq(tenants.id, ctx.tenantId));
      });

      return { avatarUrl: publicUrl };
    }),

  /** Session analytics: conversations grouped by day for the last 30 days. */
  sessionAnalytics: tenantProcedure
    .query(async ({ ctx }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db.execute(
          sql`SELECT date_trunc('day', created_at)::date AS day, count(*)::int AS count
              FROM conversations
              WHERE tenant_id = ${ctx.tenantId}
                AND created_at >= now() - interval '30 days'
              GROUP BY 1
              ORDER BY 1`,
        );
        return (rows.rows as Array<{ day: string; count: number }>);
      });
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
