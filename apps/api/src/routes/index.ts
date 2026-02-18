import { router, tenantProcedure } from '../trpc/init.js';
import { tenants } from '@camello/db';
import { eq } from 'drizzle-orm';
import { artifactRouter } from './artifact.js';
import { conversationRouter } from './conversation.js';
import { knowledgeRouter } from './knowledge.js';
import { moduleRouter } from './module.js';
import { channelRouter } from './channel.js';
import { analyticsRouter } from './analytics.js';
import { chatRouter } from './chat.js';

const tenantRouter = router({
  /** Get current tenant info. Requires auth + tenant context. */
  me: tenantProcedure.query(async ({ ctx }) => {
    const result = await ctx.tenantDb.query(async (db) => {
      return db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    });
    return result[0] ?? null;
  }),
});

export const appRouter = router({
  tenant: tenantRouter,
  artifact: artifactRouter,
  module: moduleRouter,
  conversation: conversationRouter,
  knowledge: knowledgeRouter,
  channel: channelRouter,
  analytics: analyticsRouter,
  chat: chatRouter,
  // onboarding: onboardingRouter,  // Week 4
});

export type AppRouter = typeof appRouter;
