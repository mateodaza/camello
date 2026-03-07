import { describe, it, expect, vi } from 'vitest';
import qualifyLeadModule from '../modules/qualify-lead.js';
import type { ModuleDbCallbacks, ModuleExecutionContext } from '@camello/shared/types';

type ScheduleFn = NonNullable<ModuleDbCallbacks['scheduleFollowupExecution']>;

function makeCtx(overrides?: {
  checkExists?: (convId: string, slug: string) => Promise<boolean>;
  checkQueuedFollowup?: () => Promise<boolean>;
  scheduleFollowup?: ScheduleFn;
}): ModuleExecutionContext {
  return {
    tenantId: 'tenant-001',
    artifactId: 'artifact-001',
    conversationId: 'conv-001',
    customerId: 'cust-001',
    autonomyLevel: 'fully_autonomous',
    configOverrides: {},
    db: {
      insertLead: vi.fn().mockResolvedValue('lead-001'),
      insertModuleExecution: vi.fn().mockResolvedValue('exec-001'),
      updateModuleExecution: vi.fn().mockResolvedValue(undefined),
      updateConversationStatus: vi.fn().mockResolvedValue(undefined),
      getLeadByConversation: vi.fn().mockResolvedValue(null),
      checkModuleExecutionExists: vi.fn().mockImplementation(
        overrides?.checkExists ?? (() => Promise.resolve(false)),
      ),
      checkQueuedFollowupExists: vi.fn().mockImplementation(
        overrides?.checkQueuedFollowup ?? (() => Promise.resolve(false)),
      ),
      scheduleFollowupExecution: overrides?.scheduleFollowup,
    },
  };
}

// score 85 → hot (budget+30, timeline immediate+25, needs 3×+30)
const HOT_INPUT = {
  conversation_summary: 'Ready to buy now',
  budget: '$10k',
  timeline: 'immediate' as const,
  needs: ['crm', 'automation', 'reporting'],
};

// score 30 → warm (budget+30)
const WARM_INPUT = {
  conversation_summary: 'Interested, exploring options',
  budget: '$5k',
};

// score 0 → cold
const COLD_INPUT = { conversation_summary: 'Just browsing' };

describe('qualify-lead follow-up scheduling', () => {
  it('1. warm lead → schedules follow-up in ~24h', async () => {
    const calls: Parameters<ScheduleFn>[] = [];
    const scheduleFollowup: ScheduleFn = async (data) => { calls.push([data]); };
    const ctx = makeCtx({ scheduleFollowup });
    const before = Date.now();
    await qualifyLeadModule.execute(WARM_INPUT, ctx);
    // Fire-and-forget — allow microtask queue to drain
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    const captured = calls[0][0].scheduledAt;
    const EXPECTED_DELAY = 24 * 60 * 60 * 1000;
    const diffMs = captured.getTime() - before;
    expect(diffMs).toBeGreaterThanOrEqual(EXPECTED_DELAY - 5_000);
    expect(diffMs).toBeLessThanOrEqual(EXPECTED_DELAY + 5_000);
  });

  it('2. hot lead → schedules follow-up in ~4h', async () => {
    const calls: Parameters<ScheduleFn>[] = [];
    const scheduleFollowup: ScheduleFn = async (data) => { calls.push([data]); };
    const ctx = makeCtx({ scheduleFollowup });
    const before = Date.now();
    await qualifyLeadModule.execute(HOT_INPUT, ctx);
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    const captured = calls[0][0].scheduledAt;
    const EXPECTED_DELAY = 4 * 60 * 60 * 1000;
    const diffMs = captured.getTime() - before;
    expect(diffMs).toBeGreaterThanOrEqual(EXPECTED_DELAY - 5_000);
    expect(diffMs).toBeLessThanOrEqual(EXPECTED_DELAY + 5_000);
  });

  it('3. cold lead → does not schedule follow-up', async () => {
    const calls: Parameters<ScheduleFn>[] = [];
    const scheduleFollowup: ScheduleFn = async (data) => { calls.push([data]); };
    const ctx = makeCtx({ scheduleFollowup });
    await qualifyLeadModule.execute(COLD_INPUT, ctx);
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });

  it('4. existing book_meeting execution → skips scheduling', async () => {
    const calls: Parameters<ScheduleFn>[] = [];
    const scheduleFollowup: ScheduleFn = async (data) => { calls.push([data]); };
    const ctx = makeCtx({
      checkExists: (_, slug) => Promise.resolve(slug === 'book_meeting'),
      checkQueuedFollowup: () => Promise.resolve(false),
      scheduleFollowup,
    });
    await qualifyLeadModule.execute(WARM_INPUT, ctx);
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });

  it('5. existing queued follow-up → skips scheduling', async () => {
    const calls: Parameters<ScheduleFn>[] = [];
    const scheduleFollowup: ScheduleFn = async (data) => { calls.push([data]); };
    const ctx = makeCtx({
      checkExists: () => Promise.resolve(false),
      checkQueuedFollowup: () => Promise.resolve(true),
      scheduleFollowup,
    });
    await qualifyLeadModule.execute(WARM_INPUT, ctx);
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });

  it('6. scheduleFollowupExecution absent → no crash, insertLead still called', async () => {
    const ctx = makeCtx(); // no scheduleFollowup provided
    await expect(qualifyLeadModule.execute(WARM_INPUT, ctx)).resolves.not.toThrow();
    expect(ctx.db.insertLead).toHaveBeenCalledOnce();
  });
});
