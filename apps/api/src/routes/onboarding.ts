import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { generateObject } from 'ai';
import { createLLMClient, ARCHETYPE_DEFAULT_TONES } from '@camello/ai';
import { MODEL_MAP } from '@camello/shared/constants';
import { artifacts, tenants, customers } from '@camello/db';
import type { TenantTransaction } from '@camello/db';
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
  agentType: z.enum(['sales', 'support', 'marketing', 'custom', 'advisor']),
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
// Helpers
// ---------------------------------------------------------------------------

type SetupInput = {
  name: string;
  type: 'sales' | 'support' | 'marketing' | 'custom';
  personality: Record<string, unknown>;
  constraints: Record<string, unknown>;
  profile?: {
    tagline?: string;
    bio?: string;
    avatarUrl?: string;
  };
};

async function runSetupTransaction(
  tx: TenantTransaction,
  ctx: { tenantId: string },
  input: SetupInput,
): Promise<typeof artifacts.$inferSelect> {
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
    if (art) {
      if (art.type !== 'sales') {
        // Persist the type so downstream reads (message-handler) use the sales archetype.
        await tx
          .update(artifacts)
          .set({ type: 'sales', updatedAt: new Date() })
          .where(eq(artifacts.id, art.id));
      }
      return { ...art, type: 'sales' as ArtifactType };
    }
  }

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

  const locale = ((tenantRow?.settings as Record<string, unknown>)?.preferredLocale === 'es' ? 'es' : 'en') as 'en' | 'es';
  const archetypeType = input.type as ArtifactType;

  const p = input.personality as Record<string, unknown>;
  if (!p.tone) {
    const defaultTone = ARCHETYPE_DEFAULT_TONES[archetypeType][locale];
    if (defaultTone) p.tone = defaultTone;
  }
  if (!p.language) {
    p.language = locale;
  }

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

  await applyArchetypeDefaults(tx, artifact.id, ctx.tenantId, archetypeType);

  await tx
    .update(tenants)
    .set({ defaultArtifactId: artifact.id, updatedAt: new Date() })
    .where(eq(tenants.id, ctx.tenantId));

  return artifact;
}

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
        ownerEmail: ctx.userEmail ?? null,
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
- agentType: always "sales" — this platform is sales-focused
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
- agentType: siempre "sales" — esta plataforma está enfocada en ventas
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

        // Lock: always return sales regardless of LLM classification.
        object.agentType = 'sales';

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
      profile: z.object({
        tagline: z.string().max(50).optional(),
        bio: z.string().max(150).optional(),
        avatarUrl: z.string().url().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Compute profile patch once — only fields with actual values
      const profilePatch: Record<string, unknown> | null = (() => {
        if (!input.profile) return null;
        const p: Record<string, unknown> = {};
        if (input.profile.tagline?.trim()) p.tagline = input.profile.tagline.trim();
        if (input.profile.bio?.trim())     p.bio = input.profile.bio.trim();
        if (input.profile.avatarUrl)       p.avatarUrl = input.profile.avatarUrl;
        return Object.keys(p).length > 0 ? p : null;
      })();

      // Lock: always produce a sales artifact regardless of what the wizard submitted.
      // Other archetype code is preserved for future re-enablement.
      const effectiveInput: SetupInput = {
        name: input.name,
        type: 'sales',
        personality: input.personality,
        constraints: input.constraints,
        profile: input.profile,
      };

      // -----------------------------------------------------------------------
      // Phase 1: Resolve which artifact to use (all 4 paths converge here)
      // -----------------------------------------------------------------------
      let resolvedArtifact: typeof artifacts.$inferSelect;

      const [existing] = await ctx.tenantDb.query(async (db) => {
        return db
          .select({ defaultArtifactId: tenants.defaultArtifactId })
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);
      });

      if (existing?.defaultArtifactId) {
        // Path 1: pre-tx fast-path
        const [art] = await ctx.tenantDb.query(async (db) => {
          return db
            .select()
            .from(artifacts)
            .where(eq(artifacts.id, existing.defaultArtifactId!))
            .limit(1);
        });
        if (art) {
          if (art.type !== 'sales') {
            // Persist the type so downstream reads (message-handler) use the sales archetype.
            await ctx.tenantDb.query(async (db) => {
              return db
                .update(artifacts)
                .set({ type: 'sales', updatedAt: new Date() })
                .where(eq(artifacts.id, art.id));
            });
          }
          resolvedArtifact = { ...art, type: 'sales' as ArtifactType };
        } else {
          resolvedArtifact = await ctx.tenantDb.transaction(async (tx) =>
            runSetupTransaction(tx, ctx, effectiveInput),
          );
        }
      } else {
        resolvedArtifact = await ctx.tenantDb.transaction(async (tx) =>
          runSetupTransaction(tx, ctx, effectiveInput),
        );
      }

      // -----------------------------------------------------------------------
      // Phase 2: Unified profile merge into artifacts.personality (ALL paths)
      // -----------------------------------------------------------------------
      if (profilePatch) {
        await ctx.tenantDb.query(async (db) => {
          return db
            .update(artifacts)
            .set({
              personality: sql`personality || ${JSON.stringify(profilePatch)}::jsonb`,
              updatedAt: new Date(),
            })
            .where(eq(artifacts.id, resolvedArtifact.id));
        });
        resolvedArtifact = {
          ...resolvedArtifact,
          personality: {
            ...(resolvedArtifact.personality as Record<string, unknown>),
            ...profilePatch,
          },
        };
      }

      return resolvedArtifact;
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
   * Marks onboarding as complete. Idempotently creates the internal advisor artifact.
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

    const [tenantRow] = await ctx.tenantDb.query(async (db) =>
      db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
    );

    const [existingAdvisor] = await ctx.tenantDb.query(async (db) =>
      db
        .select({ id: artifacts.id })
        .from(artifacts)
        .where(and(eq(artifacts.tenantId, ctx.tenantId), eq(artifacts.type, 'advisor')))
        .limit(1),
    );

    if (!existingAdvisor) {
      await ctx.tenantDb.query(async (db) => {
        await db.insert(artifacts).values({
          tenantId: ctx.tenantId,
          name: `${tenantRow?.name ?? 'Unnamed'} Advisor`,
          type: 'advisor',
          isActive: true,
          personality: { instructions: '', tone: 'analytical, direct, and specific' },
          constraints: {},
        });
      });
    }

    return { ok: true };
  }),
});
