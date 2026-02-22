import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { artifacts, customers } from '@camello/db';
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
        sandbox: z.boolean().optional(),
        artifactId: z.string().uuid().optional(),
      })
        .refine((d) => !d.sandbox || d.artifactId, {
          message: 'sandbox mode requires artifactId',
          path: ['artifactId'],
        })
        .refine((d) => !d.artifactId || d.sandbox, {
          message: 'artifactId requires sandbox mode',
          path: ['sandbox'],
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

      // Validate artifact before any paid work (intent classification, RAG)
      if (input.sandbox && input.artifactId) {
        const artifact = await ctx.tenantDb.query(async (db) => {
          const rows = await db
            .select({ id: artifacts.id })
            .from(artifacts)
            .where(
              and(
                eq(artifacts.id, input.artifactId!),
                eq(artifacts.tenantId, ctx.tenantId),
                eq(artifacts.isActive, true),
              ),
            )
            .limit(1);
          return rows[0];
        });

        if (!artifact) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Artifact not found or inactive' });
        }
      }

      const result = await handleMessage({
        tenantDb: ctx.tenantDb,
        tenantId: ctx.tenantId,
        channel: input.channel,
        customerId: input.customerId,
        messageText: input.message,
        existingConversationId: input.conversationId,
        ...(input.sandbox && input.artifactId
          ? { artifactId: input.artifactId, conversationMetadata: { sandbox: true } }
          : {}),
      });

      return {
        conversationId: result.conversationId,
        responseText: result.responseText,
        intent: result.intent,
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        budgetExceeded: result.budgetExceeded ?? false,
      };
    }),
});
