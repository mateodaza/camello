import { qualifyLeadInputSchema, qualifyLeadOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof qualifyLeadInputSchema._output;
type Output = typeof qualifyLeadOutputSchema._output;

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
    // Deterministic scoring per spec
    const score =
      input.budget && input.timeline === 'immediate' ? 'hot' as const
        : input.budget || input.timeline ? 'warm' as const
        : 'cold' as const;

    const tags = input.needs ?? [];
    const next_action =
      score === 'hot' ? 'offer_meeting'
        : score === 'warm' ? 'continue_qualifying'
        : 'continue_conversation';

    // Stage derived from score
    const stage =
      score === 'hot' ? 'proposal' as const
        : score === 'warm' ? 'qualifying' as const
        : 'new' as const;

    // Estimated value: parse budget string as number if possible
    const estimated_value = input.budget ? parseFloat(input.budget) || null : null;

    // Side effect: upsert into leads table via DI callback
    await ctx.db.insertLead({
      tenantId: ctx.tenantId,
      customerId: ctx.customerId,
      conversationId: ctx.conversationId,
      score,
      tags,
      budget: input.budget,
      timeline: input.timeline,
      summary: input.conversation_summary,
      stage,
      estimatedValue: estimated_value,
    });

    return { score, tags, next_action, stage, estimated_value };
  },

  formatForLLM: (output) =>
    `Lead qualified as "${output.score}" (stage: ${output.stage}). Tags: [${output.tags.join(', ')}]. Recommended: ${output.next_action}.`,
};

registerModule(qualifyLeadModule as ModuleDefinition);
