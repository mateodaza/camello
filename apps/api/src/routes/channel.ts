import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { channelConfigs } from '@camello/db';
import { channelSchema } from '@camello/shared/schemas';
import { verifyPhoneNumberId } from '../adapters/whatsapp.js';

export const channelRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.tenantDb.query(async (db) => {
      return db
        .select({
          id: channelConfigs.id,
          channelType: channelConfigs.channelType,
          webhookUrl: channelConfigs.webhookUrl,
          phoneNumber: channelConfigs.phoneNumber,
          isActive: channelConfigs.isActive,
          createdAt: channelConfigs.createdAt,
          // credentials excluded for security — never sent to client
          displayPhoneNumber: sql<string | null>`${channelConfigs.credentials}->>'display_phone_number'`,
        })
        .from(channelConfigs)
        .where(eq(channelConfigs.tenantId, ctx.tenantId));
    });
  }),

  upsert: tenantProcedure
    .input(
      z.object({
        channelType: channelSchema,
        credentials: z.record(z.unknown()).default({}),
        webhookUrl: z.string().url().nullable().optional(),
        phoneNumber: z.string().nullable().optional(),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .insert(channelConfigs)
          .values({ ...input, tenantId: ctx.tenantId })
          .onConflictDoUpdate({
            target: [channelConfigs.tenantId, channelConfigs.channelType],
            set: {
              credentials: input.credentials,
              webhookUrl: input.webhookUrl ?? null,
              phoneNumber: input.phoneNumber ?? null,
              isActive: input.isActive,
            },
          })
          .returning({
            id: channelConfigs.id,
            channelType: channelConfigs.channelType,
            webhookUrl: channelConfigs.webhookUrl,
            phoneNumber: channelConfigs.phoneNumber,
            isActive: channelConfigs.isActive,
            createdAt: channelConfigs.createdAt,
          });
        return rows[0];
      });
    }),

  delete: tenantProcedure
    .input(z.object({ channelType: channelSchema }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .delete(channelConfigs)
          .where(
            and(
              eq(channelConfigs.channelType, input.channelType),
              eq(channelConfigs.tenantId, ctx.tenantId),
            ),
          )
          .returning({ id: channelConfigs.id });
        return rows[0] ?? null;
      });
    }),

  webhookConfig: tenantProcedure.query(({ ctx }) => {
    const secret = process.env.WA_VERIFY_TOKEN_SECRET;
    if (!secret) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'WA_VERIFY_TOKEN_SECRET not configured' });
    const apiUrl = process.env.API_URL;
    if (!apiUrl) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'API_URL not configured' });
    const verifyToken = createHmac('sha256', secret).update(ctx.tenantId).digest('hex').slice(0, 32);
    const webhookUrl = `${apiUrl}/api/channels/whatsapp/webhook`;
    return { webhookUrl, verifyToken };
  }),

  verifyWhatsapp: tenantProcedure
    .input(z.object({ phoneNumberId: z.string().min(1), accessToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await verifyPhoneNumberId(input.phoneNumberId, input.accessToken);
      if (!result) {
        return { valid: false as const, error: 'Failed to verify credentials with Meta. Check your access token and phone number ID.' };
      }

      // Merge display_phone_number into existing credentials JSONB — preserves access_token
      await ctx.tenantDb.query(async (db) => {
        await db
          .update(channelConfigs)
          .set({
            credentials: sql`${channelConfigs.credentials} || ${JSON.stringify({ display_phone_number: result.displayPhoneNumber })}::jsonb`,
          })
          .where(
            and(
              eq(channelConfigs.tenantId, ctx.tenantId),
              eq(channelConfigs.channelType, 'whatsapp'),
            ),
          );
      });

      return { valid: true as const, displayPhoneNumber: result.displayPhoneNumber };
    }),
});
