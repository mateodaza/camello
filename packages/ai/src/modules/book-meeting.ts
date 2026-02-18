import { bookMeetingInputSchema, bookMeetingOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof bookMeetingInputSchema._output;
type Output = typeof bookMeetingOutputSchema._output;

const bookMeetingModule: ModuleDefinition<Input, Output> = {
  slug: 'book_meeting',
  name: 'Book Meeting',
  description:
    'Book a meeting with the customer. Specify preferred date, time, and topic. ' +
    'Call this when the customer wants to schedule a call or demo.',
  category: 'sales',
  inputSchema: bookMeetingInputSchema,
  outputSchema: bookMeetingOutputSchema,

  async execute(input: Input, _ctx: ModuleExecutionContext): Promise<Output> {
    // MVP STUB — calendar provider integration deferred
    return {
      booked: false,
      datetime: input.preferred_date,
      calendar_link: undefined,
      alternative_slots: [
        'Calendar integration pending. The team will confirm the meeting manually.',
      ],
    };
  },

  formatForLLM: (output) =>
    output.booked
      ? `Meeting booked for ${output.datetime}. Calendar link: ${output.calendar_link}`
      : `Meeting request noted for ${output.datetime}. ${output.alternative_slots?.[0] ?? 'The team will follow up to confirm.'}`,
};

registerModule(bookMeetingModule as ModuleDefinition);
