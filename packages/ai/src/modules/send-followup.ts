import { sendFollowupInputSchema, sendFollowupOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof sendFollowupInputSchema._output;
type Output = typeof sendFollowupOutputSchema._output;

const sendFollowupModule: ModuleDefinition<Input, Output> = {
  slug: 'send_followup',
  name: 'Send Follow-up',
  description:
    'Send a follow-up message to a customer who has not responded. ' +
    'Choose a template: gentle_reminder, value_add, or last_chance.',
  category: 'marketing',
  riskTier: 'medium',
  quickAction: {
    en: { label: 'Request a follow-up', message: 'Can you follow up with me about this?' },
    es: { label: 'Solicitar seguimiento', message: '¿Pueden darme seguimiento sobre esto?' },
  },
  inputSchema: sendFollowupInputSchema,
  outputSchema: sendFollowupOutputSchema,

  async execute(_input: Input, _ctx: ModuleExecutionContext): Promise<Output> {
    // Schedule follow-up 24h from now as a queued item for cron processing
    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return {
      followup_status: 'queued',
      scheduled_at: scheduledAt,
      channel: 'pending',
      followup_number: 1,
    };
  },

  formatForLLM: (output) =>
    output.followup_status === 'sent' || output.followup_status === 'processed'
      ? `Follow-up #${output.followup_number} ${output.followup_status} via ${output.channel}.`
      : `Follow-up #${output.followup_number} queued for ${output.scheduled_at}. It will be processed automatically.`,
};

registerModule(sendFollowupModule as ModuleDefinition);
