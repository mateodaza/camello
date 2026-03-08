import { bookMeetingInputSchema, bookMeetingOutputSchema, bookMeetingConfigSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof bookMeetingInputSchema._output;
type Output = typeof bookMeetingOutputSchema._output;

function parseBusinessHours(hours: string): { startH: number; endH: number } | null {
  // 12-hour: e.g. "9am-5pm", "9am-6pm"
  const match12 = hours.match(/^(\d{1,2})(am|pm)-(\d{1,2})(am|pm)$/i);
  if (match12) {
    const rawStart = parseInt(match12[1], 10);
    const rawEnd = parseInt(match12[3], 10);
    // 12-hour clock: valid hour values are 1–12
    if (rawStart < 1 || rawStart > 12 || rawEnd < 1 || rawEnd > 12) return null;
    const toH = (h: number, period: string) => {
      const isPm = period.toLowerCase() === 'pm';
      if (isPm && h !== 12) return h + 12;
      if (!isPm && h === 12) return 0;
      return h;
    };
    const startH = toH(rawStart, match12[2]);
    const endH = toH(rawEnd, match12[4]);
    return { startH, endH };
  }

  // 24-hour: e.g. "9:00-17:00"
  const match24 = hours.match(/^(\d{1,2}):00-(\d{1,2}):00$/);
  if (match24) {
    const startH = parseInt(match24[1], 10);
    const endH = parseInt(match24[2], 10);
    // 24-hour clock: valid hour values are 0–23
    if (startH > 23 || endH > 23) return null;
    return { startH, endH };
  }

  return null;
}

function checkOutsideHours(preferredTime: string | undefined, hours: string | undefined): boolean {
  if (!hours || !preferredTime || preferredTime === 'any') return false;

  const parsed = parseBusinessHours(hours);
  if (!parsed) return false;

  const { startH, endH } = parsed;

  // 24-hour: e.g. "20:00"
  const match24 = preferredTime.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const requestedH = parseInt(match24[1], 10) + parseInt(match24[2], 10) / 60;
    return requestedH < startH || requestedH >= endH;
  }

  // 12-hour: e.g. "8am", "9pm"
  const match12 = preferredTime.match(/^(\d{1,2})(am|pm)$/i);
  if (match12) {
    const isPm = match12[2].toLowerCase() === 'pm';
    let requestedH = parseInt(match12[1], 10);
    if (isPm && requestedH !== 12) requestedH += 12;
    if (!isPm && requestedH === 12) requestedH = 0;
    return requestedH < startH || requestedH >= endH;
  }

  return false;
}

function formatSuggestion(startH: number, preferredDate: string, businessHours: string): string {
  return `${String(startH).padStart(2, '0')}:00 on ${preferredDate} (within business hours: ${businessHours})`;
}

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
    const config = bookMeetingConfigSchema.parse(ctx.configOverrides);
    const { calendarUrl, businessHours } = config;

    const outside = checkOutsideHours(input.preferred_time, businessHours);
    const parsed = businessHours ? parseBusinessHours(businessHours) : null;

    const outsideHoursSlots: string[] | undefined =
      outside && parsed
        ? [formatSuggestion(parsed.startH, input.preferred_date, businessHours!)]
        : undefined;

    // Business hours violation: always reject, regardless of calendarUrl
    if (outside) {
      return {
        booked: false,
        datetime: input.preferred_date,
        calendar_link: undefined,
        alternative_slots: outsideHoursSlots,
        outsideHours: true,
      };
    }

    if (calendarUrl) {
      return {
        booked: true,
        datetime: input.preferred_date,
        calendar_link: calendarUrl,
        alternative_slots: undefined,
        outsideHours: undefined,
      };
    }

    return {
      booked: false,
      datetime: input.preferred_date,
      calendar_link: undefined,
      alternative_slots: businessHours
        ? undefined
        : ['No calendar link configured. The team will confirm the meeting manually.'],
      outsideHours: undefined,
    };
  },

  formatForLLM: (output) =>
    output.booked
      ? `Meeting booked for ${output.datetime}. Calendar link: ${output.calendar_link}`
      : `Meeting request noted for ${output.datetime}. ${output.alternative_slots?.[0] ?? 'The team will follow up to confirm.'}`,
};

registerModule(bookMeetingModule as ModuleDefinition);
