import { describe, it, expect } from 'vitest';
import { PLAN_LIMITS, PLAN_PRICES } from '@camello/shared/constants';
import type { PlanTier } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Billing page logic tests (pure — no component rendering)
// Validates constants, helper logic, and data shapes used by the billing page.
// ---------------------------------------------------------------------------

const tiers: PlanTier[] = ['starter', 'growth', 'scale'];

describe('billing page constants', () => {
  it('PLAN_PRICES has entries for all tiers', () => {
    for (const tier of tiers) {
      expect(PLAN_PRICES[tier]).toBeDefined();
      expect(PLAN_PRICES[tier].monthly).toBeGreaterThan(0);
      expect(PLAN_PRICES[tier].label).toBeTruthy();
    }
  });

  it('PLAN_PRICES are in ascending order', () => {
    expect(PLAN_PRICES.starter.monthly).toBeLessThan(PLAN_PRICES.growth.monthly);
    expect(PLAN_PRICES.growth.monthly).toBeLessThan(PLAN_PRICES.scale.monthly);
  });

  it('PLAN_LIMITS has entries for all tiers', () => {
    for (const tier of tiers) {
      const limits = PLAN_LIMITS[tier];
      expect(limits).toBeDefined();
      expect(limits.artifacts).toBeGreaterThan(0);
      expect(limits.modules).toBeGreaterThan(0);
      expect(limits.channels).toBeGreaterThan(0);
      expect(limits.resolutions_per_month).toBeGreaterThan(0);
    }
  });

  it('higher tiers have >= limits than lower tiers', () => {
    expect(PLAN_LIMITS.growth.artifacts).toBeGreaterThanOrEqual(PLAN_LIMITS.starter.artifacts);
    expect(PLAN_LIMITS.scale.artifacts).toBeGreaterThanOrEqual(PLAN_LIMITS.growth.artifacts);
    expect(PLAN_LIMITS.growth.modules).toBeGreaterThanOrEqual(PLAN_LIMITS.starter.modules);
    expect(PLAN_LIMITS.scale.modules).toBeGreaterThanOrEqual(PLAN_LIMITS.growth.modules);
  });
});

describe('billing page helper logic', () => {
  function fmtLimit(val: number): string {
    return val === Infinity ? 'Unlimited' : val.toLocaleString();
  }

  it('fmtLimit returns "Unlimited" for Infinity', () => {
    expect(fmtLimit(Infinity)).toBe('Unlimited');
  });

  it('fmtLimit formats normal numbers', () => {
    expect(fmtLimit(500)).toBe('500');
    expect(fmtLimit(2000)).toContain('2');
  });

  it('scale tier shows unlimited for artifacts/modules/channels', () => {
    expect(fmtLimit(PLAN_LIMITS.scale.artifacts)).toBe('Unlimited');
    expect(fmtLimit(PLAN_LIMITS.scale.modules)).toBe('Unlimited');
    expect(fmtLimit(PLAN_LIMITS.scale.channels)).toBe('Unlimited');
  });

  it('starter tier shows finite limits', () => {
    expect(fmtLimit(PLAN_LIMITS.starter.artifacts)).not.toBe('Unlimited');
    expect(fmtLimit(PLAN_LIMITS.starter.modules)).not.toBe('Unlimited');
  });
});
