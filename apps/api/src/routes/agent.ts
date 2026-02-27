import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, sql, gte, inArray, isNull, asc } from 'drizzle-orm';
import { router, tenantProcedure } from '../trpc/init.js';
import {
  artifacts,
  artifactModules,
  modules,
  conversations,
  moduleExecutions,
  leads,
  customers,
  interactionLogs,
  conversationArtifactAssignments,
  tenants,
} from '@camello/db';

// ---------------------------------------------------------------------------
// Shared input schemas
// ---------------------------------------------------------------------------

const artifactIdInput = z.object({ artifactId: z.string().uuid() });

const paginatedInput = z.object({
  artifactId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Agent router
// ---------------------------------------------------------------------------

export const agentRouter = router({
  // =========================================================================
  // workspace — artifact + bound modules + 30-day metrics + automationScore
  // =========================================================================

  workspace: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Fetch artifact
        const [artifact] = await db
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.id, input.artifactId), eq(artifacts.tenantId, ctx.tenantId)))
          .limit(1);

        if (!artifact) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Artifact not found' });
        }

        // Bound modules with their definitions
        const boundModules = await db
          .select({
            id: artifactModules.id,
            moduleId: artifactModules.moduleId,
            autonomyLevel: artifactModules.autonomyLevel,
            autonomySource: artifactModules.autonomySource,
            configOverrides: artifactModules.configOverrides,
            slug: modules.slug,
            name: modules.name,
            category: modules.category,
          })
          .from(artifactModules)
          .innerJoin(modules, eq(artifactModules.moduleId, modules.id))
          .where(and(
            eq(artifactModules.artifactId, input.artifactId),
            eq(artifactModules.tenantId, ctx.tenantId),
          ));

        // 30-day execution metrics
        const thirtyDaysAgo = sql`now() - interval '30 days'`;
        const [metrics] = await db
          .select({
            totalExecutions: sql<number>`count(*)::int`,
            autonomousExecutions: sql<number>`count(*) FILTER (WHERE ${moduleExecutions.status} = 'executed')::int`,
            pendingApprovals: sql<number>`count(*) FILTER (WHERE ${moduleExecutions.status} = 'pending')::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            gte(moduleExecutions.createdAt, sql`${thirtyDaysAgo}`),
          ));

        const total = metrics?.totalExecutions ?? 0;
        const autonomous = metrics?.autonomousExecutions ?? 0;
        const automationScore = total > 0 ? Math.round((autonomous / total) * 100) : 0;

        // 30-day conversation count
        const [convMetrics] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, sql`${thirtyDaysAgo}`),
          ));

        return {
          artifact,
          boundModules,
          metrics: {
            totalExecutions: total,
            autonomousExecutions: autonomous,
            pendingApprovals: metrics?.pendingApprovals ?? 0,
            automationScore,
            conversationCount: convMetrics?.count ?? 0,
          },
        };
      });
    }),

  // =========================================================================
  // activityFeed — recent module executions for an artifact (timeline)
  // =========================================================================

  activityFeed: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            moduleSlug: moduleExecutions.moduleSlug,
            status: moduleExecutions.status,
            input: moduleExecutions.input,
            output: moduleExecutions.output,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
            executedAt: moduleExecutions.executedAt,
            durationMs: moduleExecutions.durationMs,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  // =========================================================================
  // SALES procedures
  // =========================================================================

  salesPipeline: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Leads grouped by stage with counts and total value
        return db
          .select({
            stage: leads.stage,
            count: sql<number>`count(*)::int`,
            totalValue: sql<string>`coalesce(sum(${leads.estimatedValue}), 0)::text`,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(leads.tenantId, ctx.tenantId),
          ))
          .groupBy(leads.stage);
      });
    }),

  salesLeads: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      stage: z.enum(['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
      score: z.enum(['hot', 'warm', 'cold']).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(leads.tenantId, ctx.tenantId),
        ];
        if (input.stage) conditions.push(eq(leads.stage, input.stage));
        if (input.score) conditions.push(eq(leads.score, input.score));

        return db
          .select({
            id: leads.id,
            score: leads.score,
            stage: leads.stage,
            estimatedValue: leads.estimatedValue,
            budget: leads.budget,
            timeline: leads.timeline,
            summary: leads.summary,
            tags: leads.tags,
            qualifiedAt: leads.qualifiedAt,
            conversationId: leads.conversationId,
            customerName: customers.name,
            customerEmail: customers.email,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .innerJoin(customers, eq(leads.customerId, customers.id))
          .where(and(
            ...conditions,
            eq(conversations.artifactId, input.artifactId),
          ))
          .orderBy(desc(leads.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  salesQuotes: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'send_quote'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  salesFunnel: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Stage-to-stage conversion rates
        // Count leads per stage to build a funnel view
        const stages = ['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] as const;
        const rows = await db
          .select({
            stage: leads.stage,
            count: sql<number>`count(*)::int`,
          })
          .from(leads)
          .innerJoin(conversations, eq(leads.conversationId, conversations.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(leads.tenantId, ctx.tenantId),
          ))
          .groupBy(leads.stage);

        const countByStage: Record<string, number> = {};
        for (const row of rows) countByStage[row.stage] = row.count;

        return stages.map((stage) => ({
          stage,
          count: countByStage[stage] ?? 0,
        }));
      });
    }),

  updateLeadStage: tenantProcedure
    .input(z.object({
      leadId: z.string().uuid(),
      stage: z.enum(['new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost']),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const now = new Date();
        const set: Record<string, unknown> = {
          stage: input.stage,
          updatedAt: now,
        };
        if (input.stage === 'closed_won' || input.stage === 'closed_lost') {
          set.convertedAt = now;
        }

        const rows = await db
          .update(leads)
          .set(set)
          .where(and(eq(leads.id, input.leadId), eq(leads.tenantId, ctx.tenantId)))
          .returning({ id: leads.id, stage: leads.stage });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
        }
        return rows[0];
      });
    }),

  // =========================================================================
  // SUPPORT procedures
  // =========================================================================

  supportTickets: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      status: z.enum(['open', 'in_progress', 'waiting', 'closed']).optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const conditions = [
          eq(moduleExecutions.artifactId, input.artifactId),
          eq(moduleExecutions.tenantId, ctx.tenantId),
          eq(moduleExecutions.moduleSlug, 'create_ticket'),
        ];

        // Push JSONB filters into SQL so pagination is deterministic
        if (input.status) {
          conditions.push(sql`${moduleExecutions.output}->>'status' = ${input.status}`);
        }
        if (input.priority) {
          conditions.push(sql`${moduleExecutions.output}->>'priority' = ${input.priority}`);
        }

        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(...conditions))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  supportEscalations: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Escalated conversations for this artifact
        return db
          .select({
            conversationId: conversations.id,
            status: conversations.status,
            customerId: conversations.customerId,
            customerName: customers.name,
            customerEmail: customers.email,
            updatedAt: conversations.updatedAt,
            metadata: conversations.metadata,
          })
          .from(conversations)
          .innerJoin(customers, eq(conversations.customerId, customers.id))
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            eq(conversations.status, 'escalated'),
          ))
          .orderBy(desc(conversations.updatedAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  supportMetrics: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        const thirtyDaysAgo = sql`now() - interval '30 days'`;

        // Open tickets
        const [ticketStats] = await db
          .select({
            total: sql<number>`count(*)::int`,
            open: sql<number>`count(*) FILTER (WHERE (${moduleExecutions.output}->>'status') = 'open')::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'create_ticket'),
            gte(moduleExecutions.createdAt, sql`${thirtyDaysAgo}`),
          ));

        // Resolution rate (resolved / total conversations)
        const [convStats] = await db
          .select({
            total: sql<number>`count(*)::int`,
            resolved: sql<number>`count(*) FILTER (WHERE ${conversations.status} = 'resolved')::int`,
            escalated: sql<number>`count(*) FILTER (WHERE ${conversations.status} = 'escalated')::int`,
          })
          .from(conversations)
          .where(and(
            eq(conversations.artifactId, input.artifactId),
            eq(conversations.tenantId, ctx.tenantId),
            gte(conversations.createdAt, sql`${thirtyDaysAgo}`),
          ));

        const totalConv = convStats?.total ?? 0;
        const resolvedConv = convStats?.resolved ?? 0;
        const resolutionRate = totalConv > 0 ? Math.round((resolvedConv / totalConv) * 100) : 0;

        // Top ticket categories (from output JSONB)
        const categories = await db
          .select({
            category: sql<string>`${moduleExecutions.output}->>'category'`,
            count: sql<number>`count(*)::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'create_ticket'),
            gte(moduleExecutions.createdAt, sql`${thirtyDaysAgo}`),
          ))
          .groupBy(sql`${moduleExecutions.output}->>'category'`)
          .orderBy(desc(sql`count(*)`))
          .limit(10);

        return {
          totalTickets: ticketStats?.total ?? 0,
          openTickets: ticketStats?.open ?? 0,
          totalConversations: totalConv,
          resolvedConversations: resolvedConv,
          escalatedConversations: convStats?.escalated ?? 0,
          resolutionRate,
          topCategories: categories,
        };
      });
    }),

  supportKnowledgeGaps: tenantProcedure
    .input(z.object({
      artifactId: z.string().uuid(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Intents with no RAG hits — resolution_type will be null or 'no_knowledge'
        // Group by intent to find common gaps
        return db
          .select({
            intent: interactionLogs.intent,
            count: sql<number>`count(*)::int`,
            lastSeen: sql<string>`max(${interactionLogs.createdAt})::text`,
          })
          .from(interactionLogs)
          .where(and(
            eq(interactionLogs.artifactId, input.artifactId),
            eq(interactionLogs.tenantId, ctx.tenantId),
            isNull(interactionLogs.resolutionType),
            gte(interactionLogs.createdAt, sql`now() - interval '30 days'`),
          ))
          .groupBy(interactionLogs.intent)
          .orderBy(desc(sql`count(*)`))
          .limit(input.limit);
      });
    }),

  updateTicketStatus: tenantProcedure
    .input(z.object({
      executionId: z.string().uuid(),
      status: z.enum(['open', 'in_progress', 'waiting', 'closed']),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Update the ticket status inside the output JSONB
        const rows = await db
          .update(moduleExecutions)
          .set({
            output: sql`jsonb_set(COALESCE(output, '{}'), '{status}', ${JSON.stringify(input.status)}::jsonb)`,
          })
          .where(and(
            eq(moduleExecutions.id, input.executionId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'create_ticket'),
          ))
          .returning({ id: moduleExecutions.id, output: moduleExecutions.output });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
        }
        return rows[0];
      });
    }),

  acknowledgeEscalation: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Move escalated conversation to active (owner is now handling it)
        const rows = await db
          .update(conversations)
          .set({ status: 'active', updatedAt: new Date() })
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
            eq(conversations.status, 'escalated'),
          ))
          .returning({ id: conversations.id, status: conversations.status });

        if (rows.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Escalated conversation not found' });
        }
        return rows[0];
      });
    }),

  // =========================================================================
  // MARKETING procedures
  // =========================================================================

  marketingEngagement: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'capture_interest'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingFollowups: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'send_followup'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingDrafts: tenantProcedure
    .input(paginatedInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: moduleExecutions.id,
            output: moduleExecutions.output,
            status: moduleExecutions.status,
            conversationId: moduleExecutions.conversationId,
            createdAt: moduleExecutions.createdAt,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'draft_content'),
          ))
          .orderBy(desc(moduleExecutions.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      });
    }),

  marketingInterestMap: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            topic: sql<string>`${moduleExecutions.output}->>'product_or_topic'`,
            interestLevel: sql<string>`${moduleExecutions.output}->>'interest_level'`,
            count: sql<number>`count(*)::int`,
          })
          .from(moduleExecutions)
          .where(and(
            eq(moduleExecutions.artifactId, input.artifactId),
            eq(moduleExecutions.tenantId, ctx.tenantId),
            eq(moduleExecutions.moduleSlug, 'capture_interest'),
            gte(moduleExecutions.createdAt, sql`now() - interval '30 days'`),
          ))
          .groupBy(
            sql`${moduleExecutions.output}->>'product_or_topic'`,
            sql`${moduleExecutions.output}->>'interest_level'`,
          )
          .orderBy(desc(sql`count(*)`));
      });
    }),

  // =========================================================================
  // HANDOFF procedures (#50)
  // =========================================================================

  initiateHandoff: tenantProcedure
    .input(z.object({
      conversationId: z.string().uuid(),
      targetArtifactId: z.string().uuid(),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.transaction(async (tx) => {
        // 1. Fetch conversation + verify ownership
        const [conv] = await tx
          .select({
            id: conversations.id,
            artifactId: conversations.artifactId,
          })
          .from(conversations)
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
          ))
          .limit(1);

        if (!conv) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Conversation not found' });
        }

        // Anti-loop: no same-artifact transfer
        if (conv.artifactId === input.targetArtifactId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot handoff to the same artifact' });
        }

        // Verify target artifact exists and belongs to this tenant
        const [targetArtifact] = await tx
          .select({ id: artifacts.id, name: artifacts.name, type: artifacts.type })
          .from(artifacts)
          .where(and(
            eq(artifacts.id, input.targetArtifactId),
            eq(artifacts.tenantId, ctx.tenantId),
            eq(artifacts.isActive, true),
          ))
          .limit(1);

        if (!targetArtifact) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Target artifact not found or inactive' });
        }

        // Anti-loop: max 3 handoff hops
        const [hopCount] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(conversationArtifactAssignments)
          .where(eq(conversationArtifactAssignments.conversationId, input.conversationId));

        if ((hopCount?.count ?? 0) >= 3) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Maximum handoff limit (3) reached for this conversation',
          });
        }

        // Anti-loop: 5-minute cooldown (only between handoff assignments, not initial routing)
        const [recentHandoff] = await tx
          .select({ id: conversationArtifactAssignments.id })
          .from(conversationArtifactAssignments)
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.assignmentReason, 'handoff'),
            gte(conversationArtifactAssignments.startedAt, sql`now() - interval '5 minutes'`),
          ))
          .orderBy(desc(conversationArtifactAssignments.startedAt))
          .limit(1);

        if (recentHandoff) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'Handoff cooldown: please wait 5 minutes between handoffs',
          });
        }

        // Anti-loop: circular detection (target was source within same session)
        const [circular] = await tx
          .select({ id: conversationArtifactAssignments.id })
          .from(conversationArtifactAssignments)
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.artifactId, input.targetArtifactId),
            gte(conversationArtifactAssignments.startedAt, sql`now() - interval '1 hour'`),
          ))
          .limit(1);

        if (circular) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Circular handoff detected: this artifact already handled this conversation recently',
          });
        }

        const now = new Date();

        // 2. End current assignment
        await tx
          .update(conversationArtifactAssignments)
          .set({ isActive: false, endedAt: now })
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.isActive, true),
            isNull(conversationArtifactAssignments.endedAt),
          ));

        // 3. Create new assignment
        await tx
          .insert(conversationArtifactAssignments)
          .values({
            tenantId: ctx.tenantId,
            conversationId: input.conversationId,
            artifactId: input.targetArtifactId,
            assignmentReason: 'handoff',
            isActive: true,
            startedAt: now,
            metadata: {
              transferred_by: ctx.userId,
              transfer_reason: input.reason,
              source_artifact_id: conv.artifactId,
            },
          });

        // 4. Sync conversations.artifact_id
        await tx
          .update(conversations)
          .set({ artifactId: input.targetArtifactId, updatedAt: now })
          .where(and(
            eq(conversations.id, input.conversationId),
            eq(conversations.tenantId, ctx.tenantId),
          ));

        return {
          conversationId: input.conversationId,
          targetArtifact: {
            id: targetArtifact.id,
            name: targetArtifact.name,
            type: targetArtifact.type,
          },
          handoffReason: input.reason,
        };
      });
    }),

  handoffHistory: tenantProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        return db
          .select({
            id: conversationArtifactAssignments.id,
            artifactId: conversationArtifactAssignments.artifactId,
            artifactName: artifacts.name,
            artifactType: artifacts.type,
            assignmentReason: conversationArtifactAssignments.assignmentReason,
            isActive: conversationArtifactAssignments.isActive,
            startedAt: conversationArtifactAssignments.startedAt,
            endedAt: conversationArtifactAssignments.endedAt,
            metadata: conversationArtifactAssignments.metadata,
          })
          .from(conversationArtifactAssignments)
          .innerJoin(artifacts, eq(conversationArtifactAssignments.artifactId, artifacts.id))
          .where(and(
            eq(conversationArtifactAssignments.conversationId, input.conversationId),
            eq(conversationArtifactAssignments.tenantId, ctx.tenantId),
          ))
          .orderBy(asc(conversationArtifactAssignments.startedAt));
      });
    }),

  // =========================================================================
  // INTENT PRIORITY procedures (#59)
  // =========================================================================

  highPriorityIntents: tenantProcedure
    .input(artifactIdInput)
    .query(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        // Read priority intents from tenant settings (with default fallback)
        const [tenant] = await db
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);

        const settings = tenant?.settings as Record<string, unknown> | null;
        const priorityIntents = Array.isArray(settings?.priorityIntents)
          ? (settings.priorityIntents as string[])
          : ['complaint', 'escalation_request', 'negotiation'];

        if (priorityIntents.length === 0) return [];

        // Filter interaction_logs for priority intents in last 7 days
        return db
          .select({
            intent: interactionLogs.intent,
            count: sql<number>`count(*)::int`,
            latestConversationId: sql<string>`(array_agg(${interactionLogs.conversationId} ORDER BY ${interactionLogs.createdAt} DESC))[1]::text`,
            lastSeen: sql<string>`max(${interactionLogs.createdAt})::text`,
          })
          .from(interactionLogs)
          .where(and(
            eq(interactionLogs.artifactId, input.artifactId),
            eq(interactionLogs.tenantId, ctx.tenantId),
            inArray(interactionLogs.intent, priorityIntents),
            gte(interactionLogs.createdAt, sql`now() - interval '7 days'`),
          ))
          .groupBy(interactionLogs.intent)
          .orderBy(desc(sql`count(*)`));
      });
    }),

  updatePriorityIntents: tenantProcedure
    .input(z.object({
      intents: z.array(z.enum([
        'greeting', 'pricing', 'availability', 'product_question',
        'complaint', 'booking_request', 'followup', 'negotiation',
        'technical_support', 'general_inquiry', 'escalation_request',
        'simple_question', 'farewell', 'thanks',
      ])).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.tenantDb.query(async (db) => {
        await db
          .update(tenants)
          .set({
            settings: sql`jsonb_set(COALESCE(settings, '{}'), '{priorityIntents}', ${JSON.stringify(input.intents)}::jsonb)`,
          })
          .where(eq(tenants.id, ctx.tenantId));

        return { intents: input.intents };
      });
    }),
});
