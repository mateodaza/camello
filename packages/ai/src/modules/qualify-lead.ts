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
    });

    return { score, tags, next_action };
  },

  formatForLLM: (output) =>
    `Lead qualified as "${output.score}". Tags: [${output.tags.join(', ')}]. Recommended: ${output.next_action}.`,
};

registerModule(qualifyLeadModule as ModuleDefinition);
