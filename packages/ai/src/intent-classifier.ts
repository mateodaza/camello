import { generateObject } from 'ai';
import { intentSchema } from '@camello/shared/schemas';
import { REGEX_INTENTS } from '@camello/shared/constants';
import type { Intent } from '@camello/shared/types';
import { createLLMClient } from './openrouter-client.js';

/**
 * 2-pass intent classification (from CHEZ pattern):
 * Pass 1: Regex (zero cost, <1ms)
 * Pass 2: LLM via cheapest model (only when regex fails)
 */
export async function classifyIntent(message: string): Promise<Intent> {
  // Pass 1: Regex
  const regexResult = classifyByRegex(message);
  if (regexResult) return regexResult;

  // Pass 2: LLM
  return classifyByLLM(message);
}

function classifyByRegex(message: string): Intent | null {
  for (const [type, patterns] of Object.entries(REGEX_INTENTS)) {
    if (patterns.some(p => p.test(message))) {
      return {
        type: type as Intent['type'],
        confidence: 0.85,
        complexity: 'simple',
        requires_knowledge_base: false,
        sentiment: 'neutral',
        source: 'regex',
      };
    }
  }
  return null;
}

async function classifyByLLM(message: string): Promise<Intent> {
  const client = createLLMClient();

  const { object } = await generateObject({
    model: client('google/gemini-2.0-flash-001'),
    schema: intentSchema,
    prompt: `Classify the intent of this customer message into exactly one of the defined intent types.

Intent types:
- greeting: hello/hi/hey with no embedded question
- farewell: bye/goodbye
- thanks: expressing gratitude
- pricing: asking about prices, costs, plans, OR requesting a quote/proposal sent to them (e.g. "send me a quote", "cotización", "cuánto cuesta", "presupuesto")
- product_question: asking what the product/service does or includes
- availability: asking when something is available (NOT booking yet)
- booking_request: explicitly requesting to SCHEDULE A MEETING or APPOINTMENT (calendar/time/date)
- general_inquiry: any other question about the business
- simple_question: short factual question (what/where/who/when)
- complaint: expressing dissatisfaction or requesting a refund
- negotiation: discussing price terms or asking for a discount
- escalation_request: asking to speak to a human or manager
- technical_support: reporting a bug or technical issue
- followup: following up on a previous interaction
- objection: Customer pushes back on price, timing, competitor preference, or general resistance. Examples: "that's too expensive", "we already use X", "not sure this is right for us", "I need to think about it"
- comparison: Customer explicitly compares to another product or asks how you differ. Examples: "how are you different from X?", "why should I choose you over Y?", "what makes you better?"
- open_discovery: Customer is exploring or in early research. Examples: "tell me more", "what do you offer?", "how does this work?", "I'm looking for solutions". Distinct from product_question (specific feature) — this is wide-open exploration

Key distinctions:
- "Send me a quote / cotización / presupuesto" → pricing (NOT booking_request)
- "Schedule a meeting / agendar una reunión" → booking_request (NOT availability)
- "How much does X cost?" → pricing
- "We already use X" / "X is cheaper" → objection (NOT negotiation — objection is pre-interest resistance, negotiation is post-interest price discussion)
- "How are you different from X?" → comparison (NOT product_question)
- "Tell me more" / "What do you offer?" → open_discovery (NOT general_inquiry)

Message: "${message}"`,
  });

  return { ...object, source: 'llm' };
}
