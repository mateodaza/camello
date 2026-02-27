import { collectPaymentInputSchema, collectPaymentOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof collectPaymentInputSchema._output;
type Output = typeof collectPaymentOutputSchema._output;

const collectPaymentModule: ModuleDefinition<Input, Output> = {
  slug: 'collect_payment',
  name: 'Collect Payment',
  description:
    'Collect payment via a configured payment link. Capture amount and description. ' +
    'Call this when the customer is ready to pay or requests a payment link.',
  category: 'sales',
  riskTier: 'high',
  inputSchema: collectPaymentInputSchema,
  outputSchema: collectPaymentOutputSchema,

  async execute(input: Input, ctx: ModuleExecutionContext): Promise<Output> {
    const paymentUrl = ctx.configOverrides.paymentUrl as string | undefined;

    return {
      payment_url: paymentUrl ?? null,
      amount: input.amount,
      description: input.description,
      currency: input.currency,
      status: paymentUrl ? 'link_provided' : 'manual_required',
    };
  },

  formatForLLM: (output) =>
    output.status === 'link_provided'
      ? `Payment link ready: ${output.payment_url} for ${output.currency} ${output.amount} — ${output.description}.`
      : `Payment of ${output.currency} ${output.amount} for "${output.description}" noted. The team will send payment details.`,
};

registerModule(collectPaymentModule as ModuleDefinition);
