import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { tenants, billingEvents } from '@camello/db';
import { PLAN_LIMITS, PLAN_PRICES } from '@camello/shared/constants';
import type { PlanTier } from '@camello/shared/types';
import { getPaddle, tierToPriceId } from '../lib/paddle.js';

export const billingRouter = router({
  currentPlan: tenantProcedure.query(async ({ ctx }) => {
    const rows = await ctx.tenantDb.query(async (db) => {
      return db
        .select({
          planTier: tenants.planTier,
          subscriptionStatus: tenants.subscriptionStatus,
          paddleSubscriptionId: tenants.paddleSubscriptionId,
          paddleCustomerId: tenants.paddleCustomerId,
          monthlyCostBudgetUsd: tenants.monthlyCostBudgetUsd,
        })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
    });

    const tenant = rows[0];
    if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });

    const tier = tenant.planTier as PlanTier;
    return {
      planTier: tier,
      subscriptionStatus: tenant.subscriptionStatus,
      paddleSubscriptionId: tenant.paddleSubscriptionId,
      paddleCustomerId: tenant.paddleCustomerId,
      monthlyCostBudgetUsd: tenant.monthlyCostBudgetUsd,
      limits: PLAN_LIMITS[tier],
      price: PLAN_PRICES[tier],
    };
  }),

  createCheckout: tenantProcedure
    .input(z.object({ planTier: z.enum(['starter', 'growth', 'scale']) }))
    .mutation(async ({ ctx, input }) => {
      // Fetch current tenant state
      const rows = await ctx.tenantDb.query(async (db) => {
        return db
          .select({
            planTier: tenants.planTier,
            subscriptionStatus: tenants.subscriptionStatus,
            paddleSubscriptionId: tenants.paddleSubscriptionId,
          })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);
      });

      const tenant = rows[0];
      if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });

      if (tenant.planTier === input.planTier && tenant.subscriptionStatus === 'active') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already on this plan' });
      }

      const priceId = tierToPriceId(input.planTier);
      const paddle = getPaddle();

      // Active subscription exists → update in-place (proration)
      if (tenant.paddleSubscriptionId && tenant.subscriptionStatus === 'active') {
        await paddle.subscriptions.update(tenant.paddleSubscriptionId, {
          items: [{ priceId, quantity: 1 }],
          prorationBillingMode: 'prorated_immediately',
        });
        return { updated: true, transactionId: null };
      }

      // No active subscription → create new checkout transaction
      const transaction = await paddle.transactions.create({
        items: [{ priceId, quantity: 1 }],
        customData: { tenantId: ctx.tenantId },
        collectionMode: 'automatic',
      });

      return { updated: false, transactionId: transaction.id };
    }),

  cancelSubscription: tenantProcedure.mutation(async ({ ctx }) => {
    const rows = await ctx.tenantDb.query(async (db) => {
      return db
        .select({
          subscriptionStatus: tenants.subscriptionStatus,
          paddleSubscriptionId: tenants.paddleSubscriptionId,
        })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
    });

    const tenant = rows[0];
    if (!tenant?.paddleSubscriptionId || tenant.subscriptionStatus !== 'active') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No active subscription to cancel' });
    }

    const paddle = getPaddle();
    await paddle.subscriptions.cancel(tenant.paddleSubscriptionId, {
      effectiveFrom: 'next_billing_period',
    });

    return { ok: true };
  }),

  history: tenantProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).default({}))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select()
          .from(billingEvents)
          .where(eq(billingEvents.tenantId, ctx.tenantId))
          .orderBy(desc(billingEvents.createdAt))
          .limit(input.limit);
      });
    }),
});
