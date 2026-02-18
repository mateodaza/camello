import type { Intent, ModelTier } from '@camello/shared/types';
import { MODEL_MAP } from '@camello/shared/constants';

/**
 * 3-tier model selection (from CHEZ pattern):
 * fast (70% traffic) → balanced (25%) → powerful (5%)
 */
export function selectModel(intent: Intent): { tier: ModelTier; model: string } {
  const tier = selectTier(intent);
  return { tier, model: MODEL_MAP[tier] };
}

function selectTier(intent: Intent): ModelTier {
  // Escalate uncertain intents
  if (intent.confidence < 0.7) return 'balanced';

  // Route by complexity
  if (intent.complexity === 'simple') return 'fast';
  if (intent.complexity === 'complex') return 'powerful';

  // Route by type
  switch (intent.type) {
    case 'greeting':
    case 'simple_question':
    case 'availability':
    case 'farewell':
    case 'thanks':
      return 'fast';
    case 'pricing':
    case 'product_question':
    case 'booking_request':
    case 'followup':
    case 'general_inquiry':
      return 'balanced';
    case 'complaint':
    case 'negotiation':
    case 'escalation_request':
    case 'technical_support':
      return 'powerful';
    default:
      return 'balanced';
  }
}
