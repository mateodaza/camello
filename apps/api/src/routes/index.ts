import { router, publicProcedure } from '../trpc/init.js';
import { z } from 'zod';

// Placeholder routers — will be expanded in Week 1-2
const tenantRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    // TODO: Return current tenant info
    return { id: ctx.tenantId, name: 'Demo Tenant' };
  }),
});

export const appRouter = router({
  tenant: tenantRouter,
  // artifact: artifactRouter,      // Week 2
  // module: moduleRouter,          // Week 2
  // conversation: conversationRouter, // Week 3
  // knowledge: knowledgeRouter,    // Week 2
  // channel: channelRouter,        // Week 3
  // analytics: analyticsRouter,    // Week 3
  // onboarding: onboardingRouter,  // Week 4
});

export type AppRouter = typeof appRouter;
