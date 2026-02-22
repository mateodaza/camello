import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { conversations, messages, customers } from '@camello/db';

export const conversationRouter = router({
  list: tenantProcedure
    .input(
      z.object({
        status: z.enum(['active', 'resolved', 'escalated']).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(conversations.tenantId, ctx.tenantId),
          sql`NOT (${conversations.metadata} @> '{"sandbox": true}'::jsonb)`,
        ];
        if (input.status) conditions.push(eq(conversations.status, input.status));

        // Keyset pagination: if cursor provided, fetch that row's updatedAt
        // then filter to rows older than it (or same time but smaller id).
        if (input.cursor) {
          const cursorRow = await db
            .select({ updatedAt: conversations.updatedAt, id: conversations.id })
            .from(conversations)
            .where(eq(conversations.id, input.cursor))
            .limit(1);

          if (cursorRow[0]) {
            conditions.push(
              sql`(${conversations.updatedAt}, ${conversations.id}) < (${cursorRow[0].updatedAt}, ${cursorRow[0].id})`,
            );
          }
        }

        const rows = await db
          .select({
            id: conversations.id,
            artifactId: conversations.artifactId,
            customerId: conversations.customerId,
            channel: conversations.channel,
            status: conversations.status,
            createdAt: conversations.createdAt,
            updatedAt: conversations.updatedAt,
            customerName: customers.name,
            customerExternalId: customers.externalId,
          })
          .from(conversations)
          .leftJoin(customers, eq(conversations.customerId, customers.id))
          .where(and(...conditions))
          .orderBy(desc(conversations.updatedAt), desc(conversations.id))
          .limit(input.limit + 1);

        const hasMore = rows.length > input.limit;
        const items = hasMore ? rows.slice(0, input.limit) : rows;

        return {
          items,
          nextCursor: hasMore ? items[items.length - 1].id : null,
        };
      });
    }),

  byId: tenantProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select()
          .from(conversations)
          .where(and(eq(conversations.id, input.id), eq(conversations.tenantId, ctx.tenantId)))
          .limit(1);
        return rows[0] ?? null;
      });
    }),

  messages: tenantProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(100),
        before: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(messages.conversationId, input.conversationId),
          eq(messages.tenantId, ctx.tenantId),
        ];
        if (input.before) {
          conditions.push(sql`${messages.createdAt} < ${input.before}`);
        }

        return db
          .select()
          .from(messages)
          .where(and(...conditions))
          .orderBy(desc(messages.createdAt))
          .limit(input.limit);
      });
    }),

  updateStatus: tenantProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['active', 'resolved', 'escalated']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const rows = await db
          .update(conversations)
          .set({
            status: input.status,
            resolvedAt: input.status === 'resolved' ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(conversations.id, input.id), eq(conversations.tenantId, ctx.tenantId)))
          .returning();
        return rows[0] ?? null;
      });
    }),
});
