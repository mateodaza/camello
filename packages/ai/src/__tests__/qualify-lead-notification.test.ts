import { describe, it, expect, vi } from 'vitest';
import qualifyLeadModule from '../modules/qualify-lead.js';
import type { ModuleExecutionContext } from '@camello/shared/types';

const LEAD_ID = 'lead-uuid-001';

function makeCtx(insertOwnerNotification?: ModuleExecutionContext['db']['insertOwnerNotification']): ModuleExecutionContext {
  return {
    tenantId: 'tenant-001',
    artifactId: 'artifact-001',
    conversationId: 'conv-001',
    customerId: 'cust-001',
    autonomyLevel: 'fully_autonomous',
    configOverrides: {},
    db: {
      insertLead: vi.fn().mockResolvedValue(LEAD_ID),
      insertModuleExecution: vi.fn().mockResolvedValue('exec-001'),
      updateModuleExecution: vi.fn().mockResolvedValue(undefined),
      updateConversationStatus: vi.fn().mockResolvedValue(undefined),
      getLeadByConversation: vi.fn().mockResolvedValue(null),
      checkModuleExecutionExists: vi.fn().mockResolvedValue(false),
      checkQueuedFollowupExists: vi.fn().mockResolvedValue(false),
      insertOwnerNotification,
    },
  };
}

const HOT_INPUT = {
  conversation_summary: 'Ready to buy',
  budget: '$10k',
  timeline: 'immediate' as const,
  needs: ['feature_a', 'feature_b', 'feature_c'],
};

const WARM_INPUT = {
  conversation_summary: 'Considering options',
  budget: '$5k',
};

const COLD_INPUT = {
  conversation_summary: 'Just browsing',
};

describe('qualify-lead notification', () => {
  it('1. Hot lead emits hot_lead notification with correct fields', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(insertOwnerNotification);

    const result = await qualifyLeadModule.execute(HOT_INPUT, ctx);

    expect(result.score).toBe('hot');
    // Allow async notification to settle
    await Promise.resolve();

    expect(insertOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'hot_lead',
        tenantId: 'tenant-001',
        artifactId: 'artifact-001',
        leadId: LEAD_ID,
        metadata: expect.objectContaining({
          conversationId: 'conv-001',
          leadId: LEAD_ID,
        }),
      }),
    );
  });

  it('2. Warm lead does not emit notification', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(insertOwnerNotification);

    const result = await qualifyLeadModule.execute(WARM_INPUT, ctx);

    expect(result.score).toBe('warm');
    await Promise.resolve();

    expect(insertOwnerNotification).not.toHaveBeenCalled();
  });

  it('3. Cold lead does not emit notification', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(insertOwnerNotification);

    const result = await qualifyLeadModule.execute(COLD_INPUT, ctx);

    expect(result.score).toBe('cold');
    await Promise.resolve();

    expect(insertOwnerNotification).not.toHaveBeenCalled();
  });

  it('4. Missing insertOwnerNotification callback is safe (no throw)', async () => {
    const ctx = makeCtx(undefined);

    await expect(qualifyLeadModule.execute(HOT_INPUT, ctx)).resolves.toBeDefined();
  });

  it('5. insertOwnerNotification rejection does not block execute result', async () => {
    const insertOwnerNotification = vi.fn().mockRejectedValue(new Error('DB down'));
    const ctx = makeCtx(insertOwnerNotification);

    const result = await qualifyLeadModule.execute(HOT_INPUT, ctx);

    expect(result.score).toBe('hot');
    // Give the fire-and-forget promise time to reject (it should be swallowed)
    await new Promise((r) => setTimeout(r, 0));
  });
});
