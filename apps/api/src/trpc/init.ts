import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context.js';
import type { TenantDb } from '@camello/db';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const createCallerFactory = t.createCallerFactory;

// --- Auth middleware: requires Clerk session ---
const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

// --- Tenant middleware: requires authenticated user + active org ---
const hasTenantContext = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  if (!ctx.tenantId || !ctx.tenantDb) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No tenant selected. Switch to an organization in Clerk.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      tenantDb: ctx.tenantDb as TenantDb,
    },
  });
});

/** Requires Clerk authentication but no tenant context. */
export const authedProcedure = t.procedure.use(isAuthenticated);

/** Requires Clerk authentication AND an active tenant (org) context. */
export const tenantProcedure = t.procedure.use(hasTenantContext);
