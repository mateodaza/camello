import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getUtcMonthWindow,
  isBudgetExceeded,
  resolveEffectiveMonthlyBudget,
} from '../orchestration/message-handler.js';
import { buildTelemetry, createTrace } from '../lib/langfuse.js';

describe('KPI instrumentation helpers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('budget helpers', () => {
    it('computes UTC month window boundaries', () => {
      const { monthStart, nextMonthStart } = getUtcMonthWindow(
        new Date('2026-02-19T15:45:12.000Z'),
      );

      expect(monthStart.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(nextMonthStart.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    });

    it('falls back to plan default when tenant budget is null', () => {
      expect(resolveEffectiveMonthlyBudget('starter', null)).toBe(5);
      expect(resolveEffectiveMonthlyBudget('growth', undefined)).toBe(25);
      expect(resolveEffectiveMonthlyBudget('scale', null)).toBe(100);
    });

    it('uses tenant override when present', () => {
      expect(resolveEffectiveMonthlyBudget('growth', '42.5')).toBe(42.5);
      expect(resolveEffectiveMonthlyBudget('growth', 18)).toBe(18);
    });

    it('treats invalid tenant override as fallback', () => {
      expect(resolveEffectiveMonthlyBudget('growth', 'not-a-number')).toBe(25);
    });

    it('checks budget threshold as inclusive', () => {
      expect(isBudgetExceeded(25, 25)).toBe(true);
      expect(isBudgetExceeded(25.01, 25)).toBe(true);
      expect(isBudgetExceeded(24.99, 25)).toBe(false);
    });
  });

  describe('telemetry helpers', () => {
    it('buildTelemetry returns undefined when keys are missing', () => {
      expect(buildTelemetry('handle-message', { tenantId: 't1' })).toBeUndefined();
    });

    it('buildTelemetry returns config when keys exist', () => {
      vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk_test');
      vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk_test');

      const telemetry = buildTelemetry('handle-message', { tenantId: 't1', artifactId: 'a1' });
      expect(telemetry).toMatchObject({
        isEnabled: true,
        functionId: 'handle-message',
      });
    });

    it('trace context supports metadata updates and span execution', async () => {
      const trace = createTrace({
        tenantId: 'tenant-1',
        artifactId: 'unknown',
        channel: 'webchat',
      });

      trace.setMetadata({ artifactId: 'artifact-1', conversationId: 'conv-1' });
      expect(trace.metadata.artifactId).toBe('artifact-1');
      expect(trace.metadata.conversationId).toBe('conv-1');

      const result = await trace.span('unit-test-span', async () => 'ok');
      expect(result).toBe('ok');

      expect(() =>
        trace.finalize({ modelUsed: 'budget_exceeded', costUsd: 0 }),
      ).not.toThrow();
    });

    it('span propagates errors from the inner function', async () => {
      const trace = createTrace({
        tenantId: 'tenant-1',
        artifactId: 'unknown',
        channel: 'webchat',
      });

      await expect(
        trace.span('failing-span', async () => {
          throw new Error('span boom');
        }),
      ).rejects.toThrow('span boom');
    });

    it('setMetadata ignores empty strings and undefined values', () => {
      const trace = createTrace({
        tenantId: 'tenant-1',
        artifactId: 'original',
        channel: 'webchat',
      });

      trace.setMetadata({ artifactId: '', conversationId: undefined });
      expect(trace.metadata.artifactId).toBe('original');
      expect(trace.metadata.conversationId).toBeUndefined();
    });
  });
});
