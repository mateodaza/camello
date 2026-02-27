import { escalateToHumanInputSchema, escalateToHumanOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof escalateToHumanInputSchema._output;
type Output = typeof escalateToHumanOutputSchema._output;

const escalateToHumanModule: ModuleDefinition<Input, Output> = {
  slug: 'escalate_to_human',
  name: 'Escalate to Human',
  description:
    'Escalate the conversation to a human agent. Provide the reason, urgency, and a summary. ' +
    'Call this when you cannot resolve the issue or the customer explicitly asks for a human.',
  category: 'support',
  riskTier: 'medium',
  quickAction: {
    en: { label: 'Talk to a human', message: 'I would like to speak with a person' },
    es: { label: 'Hablar con una persona', message: 'Me gustaría hablar con una persona' },
  },
  inputSchema: escalateToHumanInputSchema,
  outputSchema: escalateToHumanOutputSchema,

  async execute(input: Input, ctx: ModuleExecutionContext): Promise<Output> {
    // Update conversation status to 'escalated' via DI callback
    await ctx.db.updateConversationStatus(ctx.conversationId, 'escalated');

    return {
      escalated: true,
      conversation_status: 'escalated',
      reason: input.reason,
      urgency: input.urgency,
    };
  },

  formatForLLM: (output) =>
    output.escalated
      ? `Conversation escalated to human agent. Reason: ${output.reason} (urgency: ${output.urgency}). Let the customer know a team member will follow up shortly.`
      : `Escalation was not completed. Continue assisting the customer.`,
};

registerModule(escalateToHumanModule as ModuleDefinition);
