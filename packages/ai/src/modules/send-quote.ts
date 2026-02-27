import { sendQuoteInputSchema, sendQuoteOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof sendQuoteInputSchema._output;
type Output = typeof sendQuoteOutputSchema._output;

const sendQuoteModule: ModuleDefinition<Input, Output> = {
  slug: 'send_quote',
  name: 'Send Quote',
  description:
    'Generate a structured quote with line items. ' +
    'Call this when the customer requests a price quote or estimate.',
  category: 'sales',
  riskTier: 'high',
  inputSchema: sendQuoteInputSchema,
  outputSchema: sendQuoteOutputSchema,

  async execute(input: Input, _ctx: ModuleExecutionContext): Promise<Output> {
    const total = input.items
      .reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      .toFixed(2);

    const validUntil = new Date(
      Date.now() + input.valid_days * 24 * 60 * 60 * 1000,
    ).toISOString().split('T')[0];

    const quoteId = `QT-${Date.now().toString(36).toUpperCase()}`;

    return {
      quote_id: quoteId,
      items: input.items,
      total,
      currency: input.currency,
      valid_until: validUntil,
      status: 'draft',
    };
  },

  formatForLLM: (output) =>
    `Quote ${output.quote_id} created (draft): ${output.items.length} item(s), total ${output.currency} ${output.total}. Valid until ${output.valid_until}. Awaiting owner approval before sending.`,
};

registerModule(sendQuoteModule as ModuleDefinition);
