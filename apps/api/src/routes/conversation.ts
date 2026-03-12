import { z } from 'zod';
import { eq, and, desc, asc, sql, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { conversations, messages, customers, tenants, moduleExecutions, leads, leadStageChanges, modules, tenantMembers, channelConfigs } from '@camello/db';
import { whatsappAdapter } from '../adapters/whatsapp.js';
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
        channel: z.enum(['web_chat', 'whatsapp']).optional(),
        search: z.string().max(200).optional(),
        dateRange: z.enum(['7d', '30d', 'all']).optional(),
        customerId: z.string().uuid().optional(),
        artifactId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
        showSandbox: z.boolean().default(true),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(conversations.tenantId, ctx.tenantId),
          ...(input.showSandbox === false
            ? [sql`NOT (${conversations.metadata} @> '{"sandbox": true}'::jsonb)`]
            : []),
        ];
        if (input.status) {
          conditions.push(eq(conversations.status, input.status));
        } else {
          // "All" tab: show active + escalated (actionable). Resolved has its own tab.
          conditions.push(sql`${conversations.status} IN ('active', 'escalated')`);
        }
        if (input.channel) {
          conditions.push(eq(conversations.channel, input.channel));
        }
        if (input.customerId) {
          conditions.push(eq(conversations.customerId, input.customerId));
        }
        if (input.artifactId) {
          conditions.push(eq(conversations.artifactId, input.artifactId));
        }
        if (input.dateRange && input.dateRange !== 'all') {
          const days = input.dateRange === '7d' ? 7 : 30;
          const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
          conditions.push(sql`${conversations.createdAt} >= ${cutoff}`);
        }
        if (input.search) {
          const escaped = input.search.replace(/[%_\\]/g, '\\$&');
          const pattern = `%${escaped}%`;
          conditions.push(
            or(
              sql`${customers.displayName} ILIKE ${pattern}`,
              sql`${customers.name} ILIKE ${pattern}`,
              sql`(${conversations.metadata}->>'customerName') ILIKE ${pattern}`,
              sql`EXISTS (
                SELECT 1 FROM messages
                WHERE messages.conversation_id = ${conversations.id}
                AND messages.content ILIKE ${pattern}
              )`,
            )!,
          );
        }

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
            customerName: sql<string>`COALESCE(${customers.displayName}, ${customers.name}, 'Visitor')`,
            customerExternalId: customers.externalId,
            isSandbox: sql<boolean>`(${conversations.metadata} @> '{"sandbox": true}'::jsonb)`,
            lastMessage: sql<{
              preview: string | null;
              role: string | null;
              at: string | null;
            } | null>`(
              SELECT row_to_json(t)
              FROM (
                SELECT
                  LEFT(m.content, 80) AS preview,
                  m.role              AS role,
                  m.created_at        AS at
                FROM messages m
                WHERE m.conversation_id = ${conversations.id}
                  AND m.role != 'system'
                ORDER BY m.created_at DESC, m.id DESC
                LIMIT 1
              ) t
            )`,
          })
          .from(conversations)
          .leftJoin(customers, eq(conversations.customerId, customers.id))
          .where(and(...conditions))
          .orderBy(desc(conversations.updatedAt), desc(conversations.id))
          .limit(input.limit + 1);

        type LastMsg = { preview: string | null; role: string | null; at: string | null } | null;

        const mappedRows = rows.map((r) => {
          const lm = r.lastMessage as LastMsg;
          return {
            id: r.id,
            artifactId: r.artifactId,
            customerId: r.customerId,
            channel: r.channel,
            status: r.status,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            customerName: r.customerName,
            customerExternalId: r.customerExternalId,
            isSandbox: (r.isSandbox as boolean | null) ?? false,
            lastMessagePreview: lm?.preview ?? null,
            lastMessageRole: lm?.role ?? null,
            lastMessageAt: lm?.at ? new Date(lm.at) : null,
          };
        });

        const hasMore = mappedRows.length > input.limit;
        const items = hasMore ? mappedRows.slice(0, input.limit) : mappedRows;

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
            customerName: sql<string>`COALESCE(${customers.displayName}, ${customers.name}, 'Visitor')`,
            customerEmail: customers.email,
            customerPhone: customers.phone,
            customerChannel: customers.channel,
            customerFirstSeenAt: customers.firstSeenAt,
            customerMemory: customers.memory,
            leadId: leads.id,
          })
          .from(conversations)
          .leftJoin(customers, eq(conversations.customerId, customers.id))
          .leftJoin(leads, and(eq(leads.conversationId, conversations.id), eq(leads.tenantId, ctx.tenantId)))
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
            // 1. Fetch all messages for this conversation (all roles — extractFactsRegex filters internally)
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
                .select({ memory: customers.memory, name: customers.name, email: customers.email, phone: customers.phone })
                .from(customers)
                .where(and(eq(customers.id, customerId), eq(customers.tenantId, ctx.tenantId)))
                .limit(1);
              return rows[0];
            });

            const existingFacts = parseMemoryFacts(customerRow?.memory);

            // 4. Merge facts
            const merged = mergeMemoryFacts(existingFacts, newFacts);

            // 5. Persist merged memory + sync extracted facts to top-level columns
            const memoryPayload = JSON.stringify({
              facts: merged,
              updatedAt: new Date().toISOString(),
            });

            const syncFields: Record<string, string> = {};
            const nameFact = merged.find((f) => f.key === 'name');
            if (nameFact && !customerRow?.name) syncFields.name = nameFact.value;
            const emailFact = merged.find((f) => f.key === 'email');
            if (emailFact && !customerRow?.email) syncFields.email = emailFact.value;
            const phoneFact = merged.find((f) => f.key === 'phone');
            if (phoneFact && !customerRow?.phone) syncFields.phone = phoneFact.value;

            await tenantDb.query(async (db) => {
              await db
                .update(customers)
                .set({
                  memory: sql`${memoryPayload}::jsonb`,
                  ...syncFields,
                })
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

  replyAsOwner: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      message: z.string().min(1).max(4000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Step 0 — Require authenticated user
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required.' });
      }

      // Step 1 — Authorization: check tenant_members for role = 'owner'
      const memberRows = await ctx.tenantDb.query(async (db) => {
        return db
          .select({ role: tenantMembers.role })
          .from(tenantMembers)
          .where(and(
            eq(tenantMembers.tenantId, ctx.tenantId),
            eq(tenantMembers.userId, ctx.userId!),
            eq(tenantMembers.role, 'owner'),
          ))
          .limit(1);
      });
      if (memberRows.length === 0) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the tenant owner can send owner replies.',
        });
      }

      // Step 2 — Resolve author name from context (populated in createContext, no extra API call)
      if (!ctx.userFullName) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Owner name could not be resolved.',
        });
      }
      const authorName = ctx.userFullName;

      // Step 3 — Fetch conversation + customer externalId (needed for WhatsApp waId)
      const conv = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({
            id: conversations.id,
            status: conversations.status,
            channel: conversations.channel,
            customerExternalId: customers.externalId,
          })
          .from(conversations)
          .leftJoin(customers, eq(conversations.customerId, customers.id))
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
          ))
          .limit(1);
        return rows[0] ?? null;
      });

      // Step 4 — Guard: conversation must exist and not be resolved
      if (!conv) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found.' });
      }
      if (conv.status === 'resolved') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot reply to resolved conversations.',
        });
      }

      // Step 5 — Insert message: role='human', metadata.authorName
      const inserted = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .insert(messages)
          .values({
            tenantId: ctx.tenantId,
            conversationId: input.conversationId,
            role: 'human',
            content: input.message,
            metadata: { authorName },
          })
          .returning();
        return rows[0];
      });

      // Step 6 — WhatsApp fire-and-forget delivery (webchat polls, no push needed)
      if (conv.channel === 'whatsapp' && conv.customerExternalId) {
        const tenantId = ctx.tenantId;
        const { tenantDb } = ctx;
        const waId = conv.customerExternalId;
        const text = input.message;
        void (async () => {
          try {
            const configRows = await tenantDb.query(async (db) => {
              return db
                .select({
                  credentials: channelConfigs.credentials,
                  phoneNumber: channelConfigs.phoneNumber,
                })
                .from(channelConfigs)
                .where(and(
                  eq(channelConfigs.tenantId, tenantId),
                  eq(channelConfigs.channelType, 'whatsapp'),
                ))
                .limit(1);
            });
            const config = configRows[0];
            if (!config) {
              console.error('[replyAsOwner] WhatsApp channel config not found for tenant', tenantId);
              return;
            }
            await whatsappAdapter.sendText(waId, text, {
              credentials: config.credentials as Record<string, unknown>,
              phoneNumber: config.phoneNumber ?? undefined,
            });
          } catch (err) {
            console.error('[replyAsOwner] WhatsApp delivery failed:', err);
          }
        })();
      }

      return inserted;
    }),

  activity: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Query 1: module executions with module name
        const executions = await db
          .select({
            moduleSlug: moduleExecutions.moduleSlug,
            moduleName: modules.name,
            input: moduleExecutions.input,
            output: moduleExecutions.output,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .leftJoin(modules, eq(moduleExecutions.moduleId, modules.id))
          .where(and(
            eq(moduleExecutions.conversationId, input.conversationId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
          ))
          .orderBy(asc(moduleExecutions.createdAt));

        // Query 2: find lead linked to this conversation
        const leadRows = await db
          .select({ id: leads.id })
          .from(leads)
          .where(and(
            eq(leads.conversationId, input.conversationId),
            eq(leads.tenantId, ctx.tenantId),
          ))
          .limit(1);

        // Query 3 (conditional): stage changes for the lead
        const stageChanges = leadRows[0]
          ? await db
              .select({
                fromStage: leadStageChanges.fromStage,
                toStage: leadStageChanges.toStage,
                createdAt: leadStageChanges.createdAt,
              })
              .from(leadStageChanges)
              .where(and(
                eq(leadStageChanges.leadId, leadRows[0].id),
                eq(leadStageChanges.tenantId, ctx.tenantId),
              ))
              .orderBy(asc(leadStageChanges.createdAt))
          : [];

        // Merge and sort ASC
        const items: {
          type: 'execution' | 'stage_change';
          timestamp: Date;
          moduleName?: string;
          moduleSlug?: string;
          input?: unknown;
          output?: unknown;
          fromStage?: string;
          toStage?: string;
        }[] = [
          ...executions.map((e) => ({
            type: 'execution' as const,
            timestamp: e.createdAt,
            moduleName: e.moduleName ?? undefined,
            moduleSlug: e.moduleSlug,
            input: e.input,
            output: e.output ?? undefined,
          })),
          ...stageChanges.map((s) => ({
            type: 'stage_change' as const,
            timestamp: s.createdAt,
            fromStage: s.fromStage,
            toStage: s.toStage,
          })),
        ];
        items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return items;
      });
    }),
});
