import { z } from 'zod';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, tenantProcedure } from '../trpc/init.js';
import { messages, conversations, artifacts, knowledgeDocs } from '@camello/db';
import { generateText } from 'ai';
import { generateEmbedding, createLLMClient } from '@camello/ai';
import { fetchAdvisorSnapshot } from '../lib/advisor-snapshot.js';

export const advisorRouter = router({
  /** Live business snapshot for this tenant. */
  snapshot: tenantProcedure.query(async ({ ctx }) => {
    return fetchAdvisorSnapshot(ctx.tenantDb, ctx.tenantId);
  }),

  /** Summarize an advisor session and store as a knowledge_doc for future RAG. */
  summarizeSession: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Verify the conversation exists and belongs to an advisor artifact.
      //    conversations.artifactId is a FK to artifacts.id; artifacts.type is
      //    CHECK'd to IN ('sales','support','marketing','custom','advisor').
      //    This prevents any non-advisor conversation from being summarized and
      //    polluting advisor RAG with customer-facing chat history.
      const convRows = await ctx.tenantDb.query(async (db) => {
        return db
          .select({ artifactType: artifacts.type })
          .from(conversations)
          .innerJoin(artifacts, eq(conversations.artifactId, artifacts.id))
          .where(
            and(
              eq(conversations.id, input.conversationId),
              eq(conversations.tenantId, ctx.tenantId),
            ),
          )
          .limit(1);
      });

      if (!convRows[0] || convRows[0].artifactType !== 'advisor') {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Advisor conversation not found',
        });
      }

      // 2. Fetch last 20 messages for this conversation.
      //    NOTE ON ROLES: The DB `messages` table stores roles as 'customer' | 'artifact' |
      //    'human' | 'system' (CHECK constraint in packages/db/src/schema/conversations.ts:38).
      //    This is distinct from the frontend ChatMessage type in test-chat-panel.tsx which uses
      //    'user' | 'assistant' for UI rendering only — those values are never written to the DB.
      //    We filter to ['customer', 'artifact'] to include only the owner↔advisor dialogue and
      //    exclude human-escalation ('human') and system ('system') rows.
      const msgs = await ctx.tenantDb.query(async (db) => {
        return db
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, input.conversationId),
              eq(messages.tenantId, ctx.tenantId),
              inArray(messages.role, ['customer', 'artifact']),
            ),
          )
          .orderBy(desc(messages.createdAt))
          .limit(20);
      });

      // 3. Format as chronological Owner/Advisor dialogue.
      //    'customer' → 'Owner' (owner's messages in the advisor chat)
      //    'artifact' → 'Advisor' (the advisor AI's responses)
      const reversed = [...msgs].reverse();
      const dialogue = reversed
        .map((m) => `${m.role === 'customer' ? 'Owner' : 'Advisor'}: ${m.content}`)
        .join('\n');

      // 4. LLM summarize
      const client = createLLMClient();
      const { text: summaryText } = await generateText({
        model: client('openai/gpt-4o-mini'),
        prompt: `Summarize the key business facts, corrections, and decisions from this advisor conversation in 3–5 concise bullet points. Focus on what the owner revealed about their business, not the advisor's responses.\n\n${dialogue}`,
      });

      // 5. Generate embedding for RAG searchability
      const embedding = await generateEmbedding(summaryText);

      // 6. Insert knowledge_doc with sourceType='advisor'.
      //    No isActive column on knowledgeDocs (verified: packages/db/src/schema/knowledge.ts:28-47).
      await ctx.tenantDb.query(async (db) => {
        await db.insert(knowledgeDocs).values({
          tenantId: ctx.tenantId,
          title: `Advisor session — ${new Date().toLocaleDateString()}`,
          content: summaryText,
          sourceType: 'advisor',
          embedding,
        });
      });

      return { ok: true as const, summary: summaryText };
    }),
});
