import { captureInterestInputSchema, captureInterestOutputSchema } from '@camello/shared/schemas';
import type { ModuleExecutionContext } from '@camello/shared/types';
import type { ModuleDefinition } from '../module-registry.js';
import { registerModule } from '../module-registry.js';

type Input = typeof captureInterestInputSchema._output;
type Output = typeof captureInterestOutputSchema._output;

const captureInterestModule: ModuleDefinition<Input, Output> = {
  slug: 'capture_interest',
  name: 'Capture Interest',
  description:
    'Log customer interest in a product or topic. Capture the interest level and contact info if available. ' +
    'Call this when a customer shows interest in a specific product, service, or topic.',
  category: 'marketing',
  riskTier: 'low',
  quickAction: {
    en: { label: "I'm interested", message: "I'm interested in learning more about your products" },
    es: { label: 'Me interesa', message: 'Me interesa saber más sobre sus productos' },
  },
  inputSchema: captureInterestInputSchema,
  outputSchema: captureInterestOutputSchema,

  async execute(input: Input, _ctx: ModuleExecutionContext): Promise<Output> {
    const followUpRecommended = input.interest_level !== 'browsing';

    return {
      logged: true,
      product_or_topic: input.product_or_topic,
      interest_level: input.interest_level,
      follow_up_recommended: followUpRecommended,
    };
  },

  formatForLLM: (output) =>
    `Interest logged: "${output.product_or_topic}" (level: ${output.interest_level}).${output.follow_up_recommended ? ' Follow-up recommended.' : ''}`,
};

registerModule(captureInterestModule as ModuleDefinition);
