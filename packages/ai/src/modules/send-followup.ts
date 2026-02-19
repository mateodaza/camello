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
  inputSchema: sendFollowupInputSchema,
  outputSchema: sendFollowupOutputSchema,

  async execute(_input: Input, _ctx: ModuleExecutionContext): Promise<Output> {
    // MVP STUB — channel delivery deferred to #29
    return {
      sent: false,
      channel: 'pending',
      followup_number: 1,
    };
  },

  formatForLLM: (output) =>
    output.sent
      ? `Follow-up #${output.followup_number} sent via ${output.channel}.`
      : `Follow-up queued (channel delivery pending). Follow-up #${output.followup_number}.`,
};

registerModule(sendFollowupModule as ModuleDefinition);
