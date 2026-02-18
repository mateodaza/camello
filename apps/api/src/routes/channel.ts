import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { channelConfigs } from '@camello/db';
import { channelSchema } from '@camello/shared/schemas';

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
});
