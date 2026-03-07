import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { conversations, messages, customers, tenants } from '@camello/db';
import {
  extractFactsRegex,
  mergeMemoryFacts,
  parseMemoryFacts,
  summarizeConversation,
} from '@camello/ai';

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
            summary: sql<string | null>`(${conversations.metadata}->>'summary')`,
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
          .select({
            id: conversations.id,
            tenantId: conversations.tenantId,
            artifactId: conversations.artifactId,
            customerId: conversations.customerId,
            channel: conversations.channel,
            status: conversations.status,
            metadata: conversations.metadata,
            createdAt: conversations.createdAt,
            updatedAt: conversations.updatedAt,
            resolvedAt: conversations.resolvedAt,
            customerName: customers.name,
            customerEmail: customers.email,
            customerPhone: customers.phone,
            customerChannel: customers.channel,
            customerFirstSeenAt: customers.firstSeenAt,
            customerMemory: customers.memory,
          })
          .from(conversations)
          .leftJoin(customers, eq(conversations.customerId, customers.id))
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
      const result = await ctx.tenantDb.query(async (db) => {
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

      // ── Async memory extraction on resolution (fire-and-forget, fail-open) ──
      if (input.status === 'resolved' && result) {
        const { tenantDb } = ctx;
        const conversationId = input.id;
        const customerId = result.customerId;

        setImmediate(async () => {
          try {
            // 1. Fetch customer messages for this conversation
            const msgs = await tenantDb.query(async (db) => {
              return db
                .select({ role: messages.role, content: messages.content })
                .from(messages)
                .where(
                  and(
                    eq(messages.conversationId, conversationId),
                    eq(messages.tenantId, ctx.tenantId),
                  ),
                )
                .orderBy(messages.createdAt);
            });

            // 2. Run regex extraction
            const newFacts = extractFactsRegex(msgs, conversationId);
            if (newFacts.length === 0) return;

            // 3. Fetch current customer memory (explicit tenant scope — defense-in-depth)
            const customerRow = await tenantDb.query(async (db) => {
              const rows = await db
                .select({ memory: customers.memory })
                .from(customers)
                .where(and(eq(customers.id, customerId), eq(customers.tenantId, ctx.tenantId)))
                .limit(1);
              return rows[0];
            });

            const existingFacts = parseMemoryFacts(customerRow?.memory);

            // 4. Merge facts
            const merged = mergeMemoryFacts(existingFacts, newFacts);

            // 5. Persist merged memory
            const memoryPayload = JSON.stringify({
              facts: merged,
              updatedAt: new Date().toISOString(),
            });

            await tenantDb.query(async (db) => {
              await db
                .update(customers)
                .set({ memory: sql`${memoryPayload}::jsonb` })
                .where(and(eq(customers.id, customerId), eq(customers.tenantId, ctx.tenantId)));
            });
          } catch (err) {
            console.error('[customer-memory] extraction failed (non-blocking):', err);
          }
        });
      }

      // ── Async summarization on resolution (fire-and-forget, fail-open) ──
      if (input.status === 'resolved' && result) {
        const { tenantDb } = ctx;
        const conversationId = input.id;
        const tenantId = ctx.tenantId;

        setImmediate(async () => {
          try {
            // 1. Resolve tenant locale from settings.preferredLocale (canonical pattern)
            const tenantRow = await tenantDb.query(async (db) => {
              const rows = await db
                .select({ settings: tenants.settings })
                .from(tenants)
                .where(eq(tenants.id, tenantId))
                .limit(1);
              return rows[0];
            });
            const locale = (
              (tenantRow?.settings as Record<string, unknown>)?.preferredLocale === 'es' ? 'es' : 'en'
            ) as 'en' | 'es';

            // 2. Fetch conversation messages
            const convMsgs = await tenantDb.query(async (db) => {
              return db
                .select({ role: messages.role, content: messages.content })
                .from(messages)
                .where(and(eq(messages.conversationId, conversationId), eq(messages.tenantId, tenantId)))
                .orderBy(messages.createdAt);
            });
            if (convMsgs.length === 0) return;

            // 3. Generate summary using tenant locale (returns null on failure)
            const summary = await summarizeConversation(convMsgs, locale);
            if (!summary) return;

            // 4. Persist into conversations.metadata.summary (JSONB merge, no migration)
            await tenantDb.query(async (db) => {
              await db
                .update(conversations)
                .set({ metadata: sql`metadata || jsonb_build_object('summary', ${summary})` })
                .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, tenantId)));
            });
          } catch (err) {
            console.error('[conversation-summary] summarization failed (non-blocking):', err);
          }
        });
      }

      return result;
    }),
});
