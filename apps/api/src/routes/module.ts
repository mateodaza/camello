import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import { modules, moduleExecutions, learnings, learningAuditLogs } from '@camello/db';
import { getModule, processRejection, generateEmbedding } from '@camello/ai';
import type { ModuleExecutionContext, RejectionReason } from '@camello/shared/types';
import { MODULE_TIMEOUT_MS } from '@camello/shared/constants';

export const moduleRouter = router({
  /** List global module catalog. Uses tenantProcedure for auth, but modules table has no RLS. */
  catalog: tenantProcedure
    .input(
      z.object({
        category: z.enum(['sales', 'support', 'marketing', 'operations', 'custom']).optional(),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [];
        if (input.category) conditions.push(eq(modules.category, input.category));

        return db
          .select()
          .from(modules)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(modules.name);
      });
    }),

  /** List pending module executions for the tenant. */
  pendingExecutions: tenantProcedure
    .input(
      z.object({
        artifactId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }).default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(moduleExecutions.tenantId, ctx.tenantId),
          eq(moduleExecutions.status, 'pending'),
        ];
        if (input.artifactId) conditions.push(eq(moduleExecutions.artifactId, input.artifactId));

        return db
          .select()
          .from(moduleExecutions)
          .where(and(...conditions))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit);
      });
    }),

  /**
   * Approve a pending module execution (guardrail #3: race-safe).
   *
   * 1. Atomic UPDATE ... WHERE status = 'pending' → only one caller wins
   * 2. Look up module definition from registry
   * 3. Execute with timeout
   * 4. Finalize status (executed/failed) with output + durationMs
   */
  approve: tenantProcedure
    .input(z.object({ executionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Step 1: Atomic transition pending → approved (race-safe)
      const execution = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .update(moduleExecutions)
          .set({ status: 'approved', approvedBy: ctx.userId })
          .where(
            and(
              eq(moduleExecutions.id, input.executionId),
              eq(moduleExecutions.tenantId, ctx.tenantId),
              eq(moduleExecutions.status, 'pending'),
            ),
          )
          .returning();
        return rows[0] ?? null;
      });

      if (!execution) return null;

      // Step 2: Look up module slug from modules table
      const moduleRow = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({ slug: modules.slug })
          .from(modules)
          .where(eq(modules.id, execution.moduleId))
          .limit(1);
        return rows[0] ?? null;
      });

      if (!moduleRow) {
        await ctx.tenantDb.query(async (db) => {
          await db
            .update(moduleExecutions)
            .set({ status: 'failed', output: { error: 'Module not found in catalog' }, executedAt: new Date(), durationMs: 0 })
            .where(eq(moduleExecutions.id, input.executionId));
        });
        return { ...execution, status: 'failed' as const };
      }

      // Step 3: Get module definition from in-memory registry
      const moduleDef = getModule(moduleRow.slug);
      if (!moduleDef) {
        await ctx.tenantDb.query(async (db) => {
          await db
            .update(moduleExecutions)
            .set({ status: 'failed', output: { error: 'Module definition not registered' }, executedAt: new Date(), durationMs: 0 })
            .where(eq(moduleExecutions.id, input.executionId));
        });
        return { ...execution, status: 'failed' as const };
      }

      // Step 4: Execute with timeout
      const startTime = Date.now();
      const executionCtx: ModuleExecutionContext = {
        tenantId: ctx.tenantId,
        artifactId: execution.artifactId,
        conversationId: execution.conversationId,
        customerId: '',
        autonomyLevel: 'draft_and_approve',
        configOverrides: {},
        db: {
          insertLead: async () => '',
          insertModuleExecution: async () => '',
          updateModuleExecution: async () => {},
          updateConversationStatus: async () => {},
        },
      };

      try {
        const output = await Promise.race([
          moduleDef.execute(execution.input, executionCtx),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Module timed out after ${MODULE_TIMEOUT_MS}ms`)), MODULE_TIMEOUT_MS),
          ),
        ]);

        const durationMs = Date.now() - startTime;
        await ctx.tenantDb.query(async (db) => {
          await db
            .update(moduleExecutions)
            .set({ status: 'executed', output, executedAt: new Date(), durationMs })
            .where(eq(moduleExecutions.id, input.executionId));
        });

        return { ...execution, status: 'executed' as const, output, durationMs };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await ctx.tenantDb.query(async (db) => {
          await db
            .update(moduleExecutions)
            .set({ status: 'failed', output: { error: errorMessage }, executedAt: new Date(), durationMs })
            .where(eq(moduleExecutions.id, input.executionId));
        });

        return { ...execution, status: 'failed' as const, output: { error: errorMessage }, durationMs };
      }
    }),

  /**
   * Reject a pending module execution with feedback.
   *
   * 1. Atomic UPDATE ... WHERE status = 'pending'
   * 2. Wire into processRejection() → creates/reinforces a learning
   */
  reject: tenantProcedure
    .input(z.object({
      executionId: z.string().uuid(),
      reason: z.enum(['false_positive', 'wrong_target', 'bad_timing', 'incorrect_data', 'policy_violation']),
      freeText: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Step 1: Atomic transition pending → rejected (race-safe)
      const execution = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .update(moduleExecutions)
          .set({ status: 'rejected', approvedBy: ctx.userId })
          .where(
            and(
              eq(moduleExecutions.id, input.executionId),
              eq(moduleExecutions.tenantId, ctx.tenantId),
              eq(moduleExecutions.status, 'pending'),
            ),
          )
          .returning();
        return rows[0] ?? null;
      });

      if (!execution) return null;

      // Step 2: Look up module name for learning content
      const moduleRow = await ctx.tenantDb.query(async (db) => {
        const rows = await db
          .select({ name: modules.name, slug: modules.slug })
          .from(modules)
          .where(eq(modules.id, execution.moduleId))
          .limit(1);
        return rows[0] ?? null;
      });

      if (!moduleRow) return execution;

      // Step 3: Wire into feedback loop → creates/reinforces learning
      const feedbackResult = await processRejection(
        {
          tenantId: ctx.tenantId,
          artifactId: execution.artifactId,
          conversationId: execution.conversationId,
          moduleExecutionId: input.executionId,
          moduleSlug: moduleRow.slug,
          reason: input.reason as RejectionReason,
          freeText: input.freeText,
          moduleName: moduleRow.name,
          actionSummary: JSON.stringify(execution.input),
        },
        {
          embed: generateEmbedding,
          findSimilarLearning: async (artifactId, embedding, threshold) => {
            return ctx.tenantDb.query(async (db) => {
              const rows = await db.execute(sql`
                SELECT id, content, confidence, embedding
                FROM learnings
                WHERE artifact_id = ${artifactId}::uuid
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) >= ${threshold}
                ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector ASC
                LIMIT 1
              `);
              const row = rows.rows[0] as any;
              return row ?? null;
            });
          },
          insertLearning: async (record) => {
            return ctx.tenantDb.query(async (db) => {
              const [row] = await db.insert(learnings).values({
                tenantId: record.tenantId,
                artifactId: record.artifactId,
                type: record.type,
                content: record.content,
                confidence: record.confidence.toFixed(2),
                sourceConversationId: record.sourceConversationId,
                sourceModuleExecutionId: record.sourceModuleExecutionId,
                sourceModuleSlug: record.sourceModuleSlug,
                embedding: record.embedding,
                updatedAt: new Date(),
              }).returning({ id: learnings.id });
              return row.id;
            });
          },
          updateConfidence: async (id, newConfidence) => {
            await ctx.tenantDb.query(async (db) => {
              await db
                .update(learnings)
                .set({ confidence: newConfidence.toFixed(2), updatedAt: new Date() })
                .where(eq(learnings.id, id));
            });
          },
        },
      );

      await ctx.tenantDb.query(async (db) => {
        await db.insert(learningAuditLogs).values({
          tenantId: ctx.tenantId,
          learningId: feedbackResult.learningId,
          action: feedbackResult.isReinforcement ? 'reinforced' : 'created',
          performedBy: ctx.userId,
          oldConfidence: feedbackResult.oldConfidence?.toFixed(2),
          newConfidence: feedbackResult.newConfidence.toFixed(2),
        });
      });

      return { ...execution, feedbackResult };
    }),
});
