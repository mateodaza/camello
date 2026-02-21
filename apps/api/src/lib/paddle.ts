import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import type { PlanTier, SubscriptionStatus } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Singleton Paddle client
// ---------------------------------------------------------------------------

let _paddle: Paddle | null = null;

export function getPaddle(): Paddle {
  if (!_paddle) {
    const apiKey = process.env.PADDLE_API_KEY;
    if (!apiKey) throw new Error('PADDLE_API_KEY not configured');

    _paddle = new Paddle(apiKey, {
      environment:
        process.env.PADDLE_ENVIRONMENT === 'production'
          ? Environment.production
          : Environment.sandbox,
    });
  }
  return _paddle;
}

// ---------------------------------------------------------------------------
// Price ID ↔ PlanTier mapping (env-var-based, swappable per environment)
// ---------------------------------------------------------------------------

export function priceIdToTier(priceId: string): PlanTier | null {
  const mapping: Record<string, PlanTier> = {};
  if (process.env.PADDLE_PRICE_ID_STARTER) mapping[process.env.PADDLE_PRICE_ID_STARTER] = 'starter';
  if (process.env.PADDLE_PRICE_ID_GROWTH) mapping[process.env.PADDLE_PRICE_ID_GROWTH] = 'growth';
  if (process.env.PADDLE_PRICE_ID_SCALE) mapping[process.env.PADDLE_PRICE_ID_SCALE] = 'scale';
  return mapping[priceId] ?? null;
}

export function tierToPriceId(tier: PlanTier): string {
  const mapping: Record<PlanTier, string | undefined> = {
    starter: process.env.PADDLE_PRICE_ID_STARTER,
    growth: process.env.PADDLE_PRICE_ID_GROWTH,
    scale: process.env.PADDLE_PRICE_ID_SCALE,
  };
  const priceId = mapping[tier];
  if (!priceId) throw new Error(`No PADDLE_PRICE_ID configured for tier: ${tier}`);
  return priceId;
}

// ---------------------------------------------------------------------------
// Paddle status → SubscriptionStatus mapping
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  paused: 'paused',
  trialing: 'trialing',
};

/**
 * Maps a raw Paddle subscription status to our SubscriptionStatus enum.
 * Unknown statuses fall back to 'past_due' (conservative — avoid accidental entitlement).
 * The raw status is always stored in paddle_status_raw for diagnostics.
 */
export function mapPaddleStatus(rawStatus: string): SubscriptionStatus {
  return STATUS_MAP[rawStatus] ?? 'past_due';
}
