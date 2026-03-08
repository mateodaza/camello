import { qualifyLeadInputSchema, qualifyLeadOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

const NULL_BUDGET_WORDS = new Set(['not sure', 'flexible', 'tbd', 'unknown', 'n/a', 'none', 'open']);
const APPROX_PREFIX = /^(?:~|around|about|approx(?:imately)?)\s*/i;
const CURRENCY_PREFIX = /^(?:usd|eur|cop|mxn|[$£€])\s*/i;
const RATE_SUFFIX = /\s*(?:per\s+(?:month|year|week)|\/(?:month|mo|year|yr|wk|week))\s*$/i;
const RANGE_PATTERN = /^([^-]+)-([^-]+)$/;
const MULTIPLIER_SUFFIX = /([kmb])$/i;

function parseWithMultiplier(s: string): number | null {
  const m = s.match(MULTIPLIER_SUFFIX);
  let str = s;
  let mult = 1;
  if (m) {
    str = s.slice(0, -1);
    const ch = m[1].toLowerCase();
    if (ch === 'k') mult = 1_000;
    else if (ch === 'm') mult = 1_000_000;
    else if (ch === 'b') mult = 1_000_000_000;
  }
  str = str.replace(/,/g, '');
  const n = parseFloat(str);
  return isFinite(n) ? n * mult : null;
}

export function parseBudgetString(raw: string): number | null {
  if (!raw || !raw.trim()) return null;

  let s = raw.trim().toLowerCase();
  if (NULL_BUDGET_WORDS.has(s)) return null;

  s = s.replace(APPROX_PREFIX, '').trim();
  s = s.replace(CURRENCY_PREFIX, '').trim();
  s = s.replace(RATE_SUFFIX, '').trim();

  // Range: X-Y → midpoint
  const rangeMatch = s.match(RANGE_PATTERN);
  if (rangeMatch) {
    const a = parseBudgetString(rangeMatch[1].trim());
    const b = parseBudgetString(rangeMatch[2].trim());
    if (a !== null && b !== null) return (a + b) / 2;
    // fall through to try single parse
  }

  return parseWithMultiplier(s);
}

type Input = typeof qualifyLeadInputSchema._output;
type Output = typeof qualifyLeadOutputSchema._output;

const STAGE_ORDER: Record<string, number> = {
  new: 0,
  qualifying: 1,
  proposal: 2,
  negotiation: 3,
  closed_won: 4,
  closed_lost: 4,
};
const TERMINAL_STAGES = new Set(['closed_won', 'closed_lost']);

export function computeLeadScore(input: Input): number {
  let total = 0;

  if (input.budget) total += 30;
  if (input.timeline === 'immediate') total += 25;
  else if (input.timeline === '1-3months') total += 15;

  // need_count is explicit signal; falls back to needs.length for existing callers
  const needCount = input.need_count ?? input.needs?.length ?? 0;
  total += Math.min(needCount, 3) * 10;

  if (input.is_returning) total += 15;
  if (input.asked_pricing) total += 10;

  return Math.min(total, 100);
}

const qualifyLeadModule: ModuleDefinition<Input, Output> = {
  slug: 'qualify_lead',
  name: 'Qualify Lead',
  description:
    'Score and tag a lead based on conversation signals (budget, timeline, needs). ' +
    'Call this when you identify buying signals or the customer shares qualification info.',
  category: 'sales',
  riskTier: 'low',
  quickAction: {
    en: { label: 'Tell me what you need', message: 'I need help choosing the right option for me' },
    es: { label: 'Cuéntanos qué necesitas', message: 'Necesito ayuda para elegir la mejor opción' },
  },
  inputSchema: qualifyLeadInputSchema,
  outputSchema: qualifyLeadOutputSchema,

  async execute(input: Input, ctx: ModuleExecutionContext): Promise<Output> {
    const numericScore = computeLeadScore(input);
    const score =
      numericScore >= 60 ? 'hot' as const
        : numericScore >= 30 ? 'warm' as const
        : 'cold' as const;

    const tags = input.needs ?? [];
    const next_action =
      score === 'hot' ? 'offer_meeting'
        : score === 'warm' ? 'continue_qualifying'
        : 'continue_conversation';

    // Stage derived from score
    const scoreDerivedStage =
      score === 'hot' ? 'proposal' as const
        : score === 'warm' ? 'qualifying' as const
        : 'new' as const;

    // Estimated value: parse budget string as number if possible
    const estimated_value = input.budget ? parseBudgetString(input.budget) : null;

    // Resolve final stage: never downgrade, never change terminal stages
    const existingLead = await ctx.db.getLeadByConversation(ctx.conversationId);
    let resolvedStage: string;
    let advancedFrom: string | null = null;
    if (existingLead === null) {
      resolvedStage = scoreDerivedStage;
    } else if (TERMINAL_STAGES.has(existingLead.stage)) {
      resolvedStage = existingLead.stage;
    } else if ((STAGE_ORDER[scoreDerivedStage] ?? 0) > (STAGE_ORDER[existingLead.stage] ?? 0)) {
      advancedFrom = existingLead.stage;
      resolvedStage = scoreDerivedStage;
    } else {
      resolvedStage = existingLead.stage;
    }

    // Side effect: upsert into leads table via DI callback
    const leadId = await ctx.db.insertLead({
      tenantId: ctx.tenantId,
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      score,
      tags,
      budget: input.budget,
      timeline: input.timeline,
      summary: input.conversation_summary,
      stage: resolvedStage,
      estimatedValue: estimated_value,
      sourceChannel: ctx.channel,
      sourcePage: ctx.metadata?.sourcePage as string | undefined,
    });

    // Emit hot_lead notification (non-blocking, swallowed)
    if (score === 'hot' && ctx.db.insertOwnerNotification) {
      ctx.db.insertOwnerNotification({
        tenantId: ctx.tenantId,
        artifactId: ctx.artifactId,
        leadId,
        type: 'hot_lead',
        title: 'Hot lead detected',
        body: `Scored ${numericScore}/100${input.budget ? ` · Budget: ${input.budget}` : ''}`,
        metadata: {
          conversationId: ctx.conversationId,
          leadId,
          numericScore,
          budget: input.budget ?? null,
        },
      }).catch((err: unknown) => {
        console.warn('[qualify-lead] hot_lead notification failed:', err instanceof Error ? err.message : String(err));
      });
    }

    // Emit stage_advanced notification (non-blocking, swallowed)
    if (advancedFrom !== null && ctx.db.insertOwnerNotification) {
      ctx.db.insertOwnerNotification({
        tenantId: ctx.tenantId,
        artifactId: ctx.artifactId,
        leadId,
        type: 'stage_advanced',
        title: 'Lead stage advanced',
        body: `Stage: ${advancedFrom} → ${resolvedStage}`,
        metadata: {
          conversationId: ctx.conversationId,
          leadId,
          from: advancedFrom,
          to: resolvedStage,
        },
      }).catch((err: unknown) => {
        console.warn('[qualify-lead] stage_advanced notification failed:', err instanceof Error ? err.message : String(err));
      });
    }

    // Auto-schedule follow-up for warm/hot leads (fire-and-forget, non-blocking)
    if (score !== 'cold' && ctx.db.scheduleFollowupExecution) {
      try {
        const [hasMeeting, hasQueuedFollowup] = await Promise.all([
          ctx.db.checkModuleExecutionExists(ctx.conversationId, 'book_meeting'),
          ctx.db.checkQueuedFollowupExists(ctx.conversationId),
        ]);
        if (!hasMeeting && !hasQueuedFollowup) {
          const delayMs = score === 'hot'
            ? 4 * 60 * 60 * 1000    // 4h for hot
            : 24 * 60 * 60 * 1000;  // 24h for warm
          ctx.db.scheduleFollowupExecution({
            tenantId: ctx.tenantId,
            artifactId: ctx.artifactId,
            conversationId: ctx.conversationId,
            scheduledAt: new Date(Date.now() + delayMs),
          }).catch((err: unknown) => {
            console.warn('[qualify-lead] followup scheduling failed:', err instanceof Error ? err.message : String(err));
          });
        }
      } catch (err) {
        console.warn('[qualify-lead] followup check failed:', err instanceof Error ? err.message : String(err));
      }
    }

    return { score, tags, next_action, stage: resolvedStage as Output['stage'], estimated_value, numeric_score: numericScore };
  },

  formatForLLM: (output) =>
    `Lead scored ${output.numeric_score}/100 (${output.score}). Stage: ${output.stage}. Tags: [${output.tags.join(', ')}]. Recommended: ${output.next_action}.`,
};

export default qualifyLeadModule;

registerModule(qualifyLeadModule as ModuleDefinition);
