import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { customers } from '@camello/db';
import { channelSchema } from '@camello/shared/schemas';
import { handleMessage } from '../orchestration/message-handler.js';

export const chatRouter = router({
  /** Send a message and get an AI response. Full orchestration pipeline. */
  send: tenantProcedure
    .input(
      z.object({
        message: z.string().min(1).max(4000),
        channel: channelSchema.default('webchat'),
        customerId: z.string().uuid(),
        conversationId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that the customer belongs to this tenant
      const customer = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
          .limit(1);
        return rows[0];
      });

      if (!customer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }

      const result = await handleMessage({
        tenantDb: ctx.tenantDb,
        tenantId: ctx.tenantId,
        channel: input.channel,
        customerId: input.customerId,
        messageText: input.message,
        existingConversationId: input.conversationId,
      });

      return {
        conversationId: result.conversationId,
        responseText: result.responseText,
        intent: result.intent,
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
      };
    }),
});
