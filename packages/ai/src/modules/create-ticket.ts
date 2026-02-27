import { createTicketInputSchema, createTicketOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof createTicketInputSchema._output;
type Output = typeof createTicketOutputSchema._output;

const createTicketModule: ModuleDefinition<Input, Output> = {
  slug: 'create_ticket',
  name: 'Create Ticket',
  description:
    'Create a support ticket from the conversation. Capture subject, description, priority, and category. ' +
    'Call this when the customer reports an issue that needs tracking.',
  category: 'support',
  riskTier: 'low',
  quickAction: {
    en: { label: 'Report an issue', message: 'I have a problem I need help with' },
    es: { label: 'Reportar un problema', message: 'Tengo un problema con el que necesito ayuda' },
  },
  inputSchema: createTicketInputSchema,
  outputSchema: createTicketOutputSchema,

  async execute(input: Input, _ctx: ModuleExecutionContext): Promise<Output> {
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase()}`;

    return {
      ticket_id: ticketId,
      subject: input.subject,
      priority: input.priority,
      category: input.category ?? null,
      status: 'open',
    };
  },

  formatForLLM: (output) =>
    `Ticket ${output.ticket_id} created: "${output.subject}" (priority: ${output.priority}, status: ${output.status}).`,
};

registerModule(createTicketModule as ModuleDefinition);
