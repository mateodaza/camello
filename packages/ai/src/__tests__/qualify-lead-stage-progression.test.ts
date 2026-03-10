import { describe, it, expect, vi } from 'vitest';
import qualifyLeadModule from '../modules/qualify-lead.js';
import type { ModuleExecutionContext } from '@camello/shared/types';

const LEAD_ID = 'lead-uuid-stage-001';

function makeCtx(
  getLeadByConversation: ModuleExecutionContext['db']['getLeadByConversation'],
  insertOwnerNotification?: ModuleExecutionContext['db']['insertOwnerNotification'],
): ModuleExecutionContext {
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
      getLeadByConversation,
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

describe('qualify-lead stage progression', () => {
  it('1. New lead (null) — warm rescore uses score-derived stage (qualifying)', async () => {
    const ctx = makeCtx(vi.fn().mockResolvedValue(null));

    const result = await qualifyLeadModule.execute(WARM_INPUT, ctx);

    expect(result.stage).toBe('qualifying');
    expect(result.score).toBe('warm');
    const insertLead = ctx.db.insertLead as ReturnType<typeof vi.fn>;
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ stage: 'qualifying' }));
  });

  it('2. cold→warm advances new → qualifying, emits stage_advanced', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(
      vi.fn().mockResolvedValue({ stage: 'new' }),
      insertOwnerNotification,
    );

    const result = await qualifyLeadModule.execute(WARM_INPUT, ctx);

    expect(result.stage).toBe('qualifying');
    const insertLead = ctx.db.insertLead as ReturnType<typeof vi.fn>;
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ stage: 'qualifying' }));

    await Promise.resolve();
    expect(insertOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stage_advanced',
        metadata: expect.objectContaining({ from: 'new', to: 'qualifying' }),
      }),
    );
  });

  it('3. warm→hot advances qualifying → proposal, emits stage_advanced', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(
      vi.fn().mockResolvedValue({ stage: 'qualifying' }),
      insertOwnerNotification,
    );

    const result = await qualifyLeadModule.execute(HOT_INPUT, ctx);

    expect(result.stage).toBe('proposal');
    const insertLead = ctx.db.insertLead as ReturnType<typeof vi.fn>;
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ stage: 'proposal' }));

    await Promise.resolve();
    expect(insertOwnerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stage_advanced',
        metadata: expect.objectContaining({ from: 'qualifying', to: 'proposal' }),
      }),
    );
  });

  it('4. hot→cold does NOT downgrade (proposal stays proposal), no stage_advanced', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(
      vi.fn().mockResolvedValue({ stage: 'proposal' }),
      insertOwnerNotification,
    );

    const result = await qualifyLeadModule.execute(COLD_INPUT, ctx);

    expect(result.stage).toBe('proposal');
    const insertLead = ctx.db.insertLead as ReturnType<typeof vi.fn>;
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ stage: 'proposal' }));
    expect(insertLead).not.toHaveBeenCalledWith(expect.objectContaining({ stage: 'new' }));

    await Promise.resolve();
    const stageAdvancedCalls = (insertOwnerNotification.mock.calls as Array<Array<{ type: string }>>)
      .filter((args) => args[0]?.type === 'stage_advanced');
    expect(stageAdvancedCalls).toHaveLength(0);
  });

  it('5. terminal closed_won is never changed, no stage_advanced', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(
      vi.fn().mockResolvedValue({ stage: 'closed_won' }),
      insertOwnerNotification,
    );

    const result = await qualifyLeadModule.execute(HOT_INPUT, ctx);

    expect(result.stage).toBe('closed_won');
    const insertLead = ctx.db.insertLead as ReturnType<typeof vi.fn>;
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ stage: 'closed_won' }));

    await Promise.resolve();
    const stageAdvancedCalls = (insertOwnerNotification.mock.calls as Array<Array<{ type: string }>>)
      .filter((args) => args[0]?.type === 'stage_advanced');
    expect(stageAdvancedCalls).toHaveLength(0);
  });

  it('6. same stage — no advancement, no stage_advanced notification', async () => {
    const insertOwnerNotification = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx(
      vi.fn().mockResolvedValue({ stage: 'qualifying' }),
      insertOwnerNotification,
    );

    const result = await qualifyLeadModule.execute(WARM_INPUT, ctx);

    expect(result.stage).toBe('qualifying');
    const insertLead = ctx.db.insertLead as ReturnType<typeof vi.fn>;
    expect(insertLead).toHaveBeenCalledWith(expect.objectContaining({ stage: 'qualifying' }));

    await Promise.resolve();
    const stageAdvancedCalls = (insertOwnerNotification.mock.calls as Array<Array<{ type: string }>>)
      .filter((args) => args[0]?.type === 'stage_advanced');
    expect(stageAdvancedCalls).toHaveLength(0);
  });
});
