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
  riskTier: 'medium',
  quickAction: {
    en: { label: 'Book a meeting', message: "I'd like to schedule a meeting" },
    es: { label: 'Agendar reunión', message: 'Me gustaría agendar una reunión' },
  },
  inputSchema: bookMeetingInputSchema,
  outputSchema: bookMeetingOutputSchema,

  async execute(input: Input, ctx: ModuleExecutionContext): Promise<Output> {
    const calendarUrl = ctx.configOverrides.calendarUrl as string | undefined;

    if (calendarUrl) {
      return {
        booked: true,
        datetime: input.preferred_date,
        calendar_link: calendarUrl,
        alternative_slots: undefined,
      };
    }

    return {
      booked: false,
      datetime: input.preferred_date,
      calendar_link: undefined,
      alternative_slots: [
        'No calendar link configured. The team will confirm the meeting manually.',
      ],
    };
  },

  formatForLLM: (output) =>
    output.booked
      ? `Meeting booked for ${output.datetime}. Calendar link: ${output.calendar_link}`
      : `Meeting request noted for ${output.datetime}. ${output.alternative_slots?.[0] ?? 'The team will follow up to confirm.'}`,
};

registerModule(bookMeetingModule as ModuleDefinition);
