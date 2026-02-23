import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { generateObject } from 'ai';
import { createLLMClient, ARCHETYPE_DEFAULT_TONES } from '@camello/ai';
import { MODEL_MAP } from '@camello/shared/constants';
import { artifacts, tenants, customers } from '@camello/db';
import type { ArtifactType } from '@camello/shared/types';
import { router, authedProcedure, tenantProcedure } from '../trpc/init.js';
import { provisionTenant } from '../services/tenant-provisioning.js';
import { applyArchetypeDefaults } from '../lib/apply-archetype-defaults.js';
import { validatePersonality, PERSONALITY_VALIDATION_MESSAGE } from '../lib/personality-validator.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const personalitySchema = z.object({
  tone: z.enum(['professional', 'friendly', 'casual', 'formal']),
  greeting: z.string(),
  goals: z.array(z.string()),
});

const constraintsSchema = z.object({
  neverDiscuss: z.array(z.string()),
  alwaysEscalate: z.array(z.string()),
});

export const BusinessModelSuggestionSchema = z.object({
  template: z.enum(['services', 'ecommerce', 'saas', 'restaurant', 'realestate']),
  agentName: z.string(),
  agentType: z.enum(['sales', 'support', 'marketing', 'custom']),
  personality: personalitySchema,
  constraints: constraintsSchema,
  industry: z.string(),
  confidence: z.number().min(0).max(1),
});

export type BusinessModelSuggestion = z.infer<typeof BusinessModelSuggestionSchema>;

export const DEFAULT_SERVICES_SUGGESTION: BusinessModelSuggestion = {
  template: 'services',
  agentName: 'Alex',
  agentType: 'sales',
  personality: {
    tone: 'friendly',
    greeting: 'Hi there! I\'m here to help you learn about our services. How can I assist you today?',
    goals: [
      'Understand customer needs and qualify interest',
      'Schedule a discovery call or meeting',
      'Follow up with relevant information',
    ],
  },
  constraints: {
    neverDiscuss: ['competitor pricing', 'internal processes'],
    alwaysEscalate: ['angry customer', 'refund request', 'legal question'],
  },
  industry: 'professional services',
  confidence: 0.5,
};

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const onboardingRouter = router({
  /**
   * Idempotent tenant provisioning — handles the race condition where
   * the wizard loads before the Clerk webhook has fired.
   */
  provision: authedProcedure
    .input(z.object({
      orgId: z.string().min(1),
      companyName: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      // Security: require active org context and match against input
      if (!ctx.orgId || ctx.orgId !== input.orgId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Organization ID mismatch' });
      }

      return provisionTenant({
        orgId: input.orgId,
        orgName: input.companyName,
        creatorUserId: ctx.userId,
      });
    }),

  /**
   * AI-powered business model parsing. Takes a free-text description
   * and returns a structured suggestion via generateObject + Zod schema.
   */
  parseBusinessModel: authedProcedure
    .input(z.object({
      description: z.string().min(10).max(2000),
      locale: z.enum(['en', 'es']).optional().default('en'),
    }))
    .mutation(async ({ input }) => {
      try {
        const client = createLLMClient();

        const promptEn = `You are a business analyst for an AI agent platform. Classify this business and suggest an AI sales agent configuration.

Business description: "${input.description}"

Guidelines:
- template: choose the closest match (services for agencies/consulting, ecommerce for online stores, saas for software, restaurant for F&B, realestate for property)
- agentName: suggest a friendly first name (e.g. Alex, Sam, Maya)
- agentType: almost always "sales" for MVP
- personality.tone: match the business style
- personality.greeting: one welcoming sentence
- personality.goals: 3 actionable goals for this agent
- constraints.neverDiscuss: topics the agent should avoid
- constraints.alwaysEscalate: situations requiring a human
- industry: brief industry label
- confidence: 0-1 how confident you are in this classification`;

        const promptEs = `Eres un analista de negocios para una plataforma de agentes IA. Clasifica este negocio y sugiere una configuración de agente de ventas.

Descripción del negocio: "${input.description}"

Directrices:
- template: elige la opción más cercana (services para agencias/consultoría, ecommerce para tiendas en línea, saas para software, restaurant para comida/bebida, realestate para inmobiliaria)
- agentName: sugiere un nombre amigable (ej. Alex, Sam, Maya, Camila)
- agentType: casi siempre "sales" para el MVP
- personality.tone: adapta al estilo del negocio
- personality.greeting: una oración de bienvenida EN ESPAÑOL
- personality.goals: 3 objetivos accionables para este agente EN ESPAÑOL
- constraints.neverDiscuss: temas que el agente debe evitar EN ESPAÑOL
- constraints.alwaysEscalate: situaciones que requieren un humano EN ESPAÑOL
- industry: etiqueta breve de la industria EN ESPAÑOL
- confidence: 0-1 qué tan seguro estás de esta clasificación`;

        const { object } = await generateObject({
          model: client(MODEL_MAP.fast),
          schema: BusinessModelSuggestionSchema,
          prompt: input.locale === 'es' ? promptEs : promptEn,
        });

        return object;
      } catch (err) {
        console.warn('[onboarding] parseBusinessModel LLM error, using default:', err);
        return DEFAULT_SERVICES_SUGGESTION;
      }
    }),

  /**
   * Atomic artifact setup: create artifact + attach modules + set as
   * tenant default. All in one transaction.
   */
  setupArtifact: tenantProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['sales', 'support', 'marketing', 'custom']),
      personality: z.record(z.unknown()).default({}).refine(validatePersonality, { message: PERSONALITY_VALIDATION_MESSAGE }),
      constraints: z.record(z.unknown()).default({}),
      // moduleIds kept optional for backward compat — ignored by backend
      moduleIds: z.array(z.string().uuid()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fast-path idempotency: if tenant already has a default artifact, return it
      const [existing] = await ctx.tenantDb.query(async (db) => {
        return db
          .select({ defaultArtifactId: tenants.defaultArtifactId })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);
      });
      if (existing?.defaultArtifactId) {
        const [art] = await ctx.tenantDb.query(async (db) => {
          return db
            .select()
            .from(artifacts)
            .where(eq(artifacts.id, existing.defaultArtifactId!))
            .limit(1);
        });
        if (art) return art;
      }

      return ctx.tenantDb.transaction(async (tx) => {
        // Advisory lock: serialize concurrent setupArtifact for same tenant+type
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId}), hashtext(${input.type}))`,
        );

        // Re-check inside transaction: another request may have won the race
        const [tenantRow] = await tx
          .select({ defaultArtifactId: tenants.defaultArtifactId, settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);

        if (tenantRow?.defaultArtifactId) {
          const [art] = await tx
            .select()
            .from(artifacts)
            .where(eq(artifacts.id, tenantRow.defaultArtifactId))
            .limit(1);
          if (art) return art;
        }

        // Check if an artifact of this type already exists (idempotent adopt)
        const [existingByType] = await tx
          .select()
          .from(artifacts)
          .where(and(eq(artifacts.tenantId, ctx.tenantId), eq(artifacts.type, input.type)))
          .limit(1);

        if (existingByType) {
          await tx
            .update(tenants)
            .set({ defaultArtifactId: existingByType.id, updatedAt: new Date() })
            .where(eq(tenants.id, ctx.tenantId));
          return existingByType;
        }

        // Resolve locale for archetype defaults
        const locale = ((tenantRow?.settings as Record<string, unknown>)?.preferredLocale === 'es' ? 'es' : 'en') as 'en' | 'es';
        const archetypeType = input.type as ArtifactType;

        // Apply archetype defaults to personality if not already set by LLM suggestion
        const p = input.personality as Record<string, unknown>;
        if (!p.tone) {
          const defaultTone = ARCHETYPE_DEFAULT_TONES[archetypeType][locale];
          if (defaultTone) p.tone = defaultTone;
        }

        // 1. Create artifact
        const [artifact] = await tx
          .insert(artifacts)
          .values({
            tenantId: ctx.tenantId,
            name: input.name,
            type: input.type,
            personality: p,
            constraints: input.constraints,
            escalation: { escalate_on: ['human_requested', 'complaint'] },
          })
          .returning();

        // 2. Auto-bind archetype-specific modules (ignores client-sent moduleIds)
        await applyArchetypeDefaults(tx, artifact.id, ctx.tenantId, archetypeType);

        // 3. Set as default artifact for the tenant
        await tx
          .update(tenants)
          .set({ defaultArtifactId: artifact.id, updatedAt: new Date() })
          .where(eq(tenants.id, ctx.tenantId));

        return artifact;
      });
    }),

  /**
   * Creates a preview customer for the authenticated user if one
   * doesn't already exist. Used by Step 5 when provisionTenant
   * was called without a creatorUserId (webhook path).
   */
  ensurePreviewCustomer: tenantProcedure.mutation(async ({ ctx }) => {
    // Try to insert — ON CONFLICT DO NOTHING if already exists
    const inserted = await ctx.tenantDb.query(async (db) => {
      return db
        .insert(customers)
        .values({
          tenantId: ctx.tenantId,
          externalId: ctx.userId,
          channel: 'webchat',
          name: 'Founder Preview',
        })
        .onConflictDoNothing({ target: [customers.tenantId, customers.channel, customers.externalId] })
        .returning({ id: customers.id });
    });

    if (inserted[0]) {
      return { customerId: inserted[0].id };
    }

    // Already existed — look it up
    const existing = await ctx.tenantDb.query(async (db) => {
      return db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, ctx.tenantId),
            eq(customers.channel, 'webchat'),
            eq(customers.externalId, ctx.userId),
          ),
        )
        .limit(1);
    });

    if (!existing[0]) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to find or create preview customer' });
    }

    return { customerId: existing[0].id };
  }),

  /**
   * Returns current onboarding status: settings + preview customer ID.
   */
  getStatus: tenantProcedure.query(async ({ ctx }) => {
    const [tenantRow] = await ctx.tenantDb.query(async (db) => {
      return db
        .select({ settings: tenants.settings, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
    });

    const previewCustomer = await ctx.tenantDb.query(async (db) => {
      return db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, ctx.tenantId),
            eq(customers.channel, 'webchat'),
            eq(customers.externalId, ctx.userId),
          ),
        )
        .limit(1);
    });

    return {
      settings: tenantRow?.settings ?? null,
      tenantName: tenantRow?.name ?? null,
      previewCustomerId: previewCustomer[0]?.id ?? null,
    };
  }),

  /**
   * Persists current wizard step in tenant settings JSONB.
   */
  saveStep: tenantProcedure
    .input(z.object({
      step: z.number().int().min(1).max(6).optional(),
      suggestion: BusinessModelSuggestionSchema.nullable().optional(),
      businessDescription: z.string().max(2000).optional(),
      businessDescriptionSeeded: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      if (input.step !== undefined) {
        patch.onboardingStep = input.step;
      }
      if (input.suggestion !== undefined) {
        patch.suggestion = input.suggestion;
      }
      if (input.businessDescription !== undefined) {
        patch.businessDescription = input.businessDescription;
      }
      if (input.businessDescriptionSeeded !== undefined) {
        patch.businessDescriptionSeeded = input.businessDescriptionSeeded;
      }
      await ctx.tenantDb.query(async (db) => {
        await db
          .update(tenants)
          .set({
            settings: sql`COALESCE(settings, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, ctx.tenantId));
      });
      return { ok: true };
    }),

  /**
   * Marks onboarding as complete.
   */
  complete: tenantProcedure.mutation(async ({ ctx }) => {
    await ctx.tenantDb.query(async (db) => {
      await db
        .update(tenants)
        .set({
          settings: sql`COALESCE(settings, '{}'::jsonb) || '{"onboardingComplete": true}'::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, ctx.tenantId));
    });
    return { ok: true };
  }),
});
