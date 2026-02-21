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

const tenantRouter = router({
  /** Get current tenant info. Requires auth + tenant context. */
  me: tenantProcedure.query(async ({ ctx }) => {
    const result = await ctx.tenantDb.query(async (db) => {
      return db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    });
    return result[0] ?? null;
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
