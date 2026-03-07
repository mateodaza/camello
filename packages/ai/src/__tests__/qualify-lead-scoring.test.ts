import { describe, it, expect, vi } from 'vitest';
import qualifyLeadModule from '../modules/qualify-lead.js';
import type { ModuleExecutionContext } from '@camello/shared/types';

function makeCtx(): ModuleExecutionContext {
  return {
    tenantId: 'tenant-001',
    artifactId: 'artifact-001',
    conversationId: 'conv-001',
    customerId: 'cust-001',
    autonomyLevel: 'fully_autonomous',
    configOverrides: {},
    db: {
      insertLead: vi.fn().mockResolvedValue(undefined),
      insertModuleExecution: vi.fn().mockResolvedValue(undefined),
      updateModuleExecution: vi.fn().mockResolvedValue(undefined),
      updateConversationStatus: vi.fn().mockResolvedValue(undefined),
      getLeadByConversation: vi.fn().mockResolvedValue(null),
    },
  };
}

const BASE = { conversation_summary: 'test' };

describe('qualify-lead scoring', () => {
  it('1. No signals → score=0, cold', async () => {
    const result = await qualifyLeadModule.execute(BASE, makeCtx());
    expect(result.numeric_score).toBe(0);
    expect(result.score).toBe('cold');
  });

  it('2. Budget only → score=30, warm', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k' }, makeCtx());
    expect(result.numeric_score).toBe(30);
    expect(result.score).toBe('warm');
  });

  it('3. Timeline immediate only → score=25, cold', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, timeline: 'immediate' }, makeCtx());
    expect(result.numeric_score).toBe(25);
    expect(result.score).toBe('cold');
  });

  it('4. Timeline 1-3months only → score=15, cold', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, timeline: '1-3months' }, makeCtx());
    expect(result.numeric_score).toBe(15);
    expect(result.score).toBe('cold');
  });

  it('5. Budget + immediate → score=55, warm', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k', timeline: 'immediate' }, makeCtx());
    expect(result.numeric_score).toBe(55);
    expect(result.score).toBe('warm');
  });

  it('6. Budget + immediate + 1 need via needs.length → score=65, hot', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k', timeline: 'immediate', needs: ['x'] }, makeCtx());
    expect(result.numeric_score).toBe(65);
    expect(result.score).toBe('hot');
  });

  it('7. Budget + immediate + asked_pricing → score=65, hot', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k', timeline: 'immediate', asked_pricing: true }, makeCtx());
    expect(result.numeric_score).toBe(65);
    expect(result.score).toBe('hot');
  });

  it('8. Budget + immediate + is_returning → score=70, hot', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k', timeline: 'immediate', is_returning: true }, makeCtx());
    expect(result.numeric_score).toBe(70);
    expect(result.score).toBe('hot');
  });

  it('9. All signals, need_count=3 → score=100 (capped from 110), hot', async () => {
    const result = await qualifyLeadModule.execute({
      ...BASE, budget: '$5k', timeline: 'immediate',
      need_count: 3, is_returning: true, asked_pricing: true,
    }, makeCtx());
    expect(result.numeric_score).toBe(100);
    expect(result.score).toBe('hot');
  });

  it('10. need_count > 3 capped at 3 contribution', async () => {
    const result3 = await qualifyLeadModule.execute({ ...BASE, need_count: 3 }, makeCtx());
    const result5 = await qualifyLeadModule.execute({ ...BASE, need_count: 5 }, makeCtx());
    expect(result3.numeric_score).toBe(result5.numeric_score);
    expect(result3.numeric_score).toBe(30);
  });

  it('11. need_count wins over needs.length: need_count=2, needs has 3 → contribution=20', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, need_count: 2, needs: ['a', 'b', 'c'] }, makeCtx());
    expect(result.numeric_score).toBe(20);
  });

  it('12. Fallback to needs.length when need_count absent: needs=["x","y"] → contribution=20', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, needs: ['x', 'y'] }, makeCtx());
    expect(result.numeric_score).toBe(20);
  });

  it('13. Fallback: need_count absent + needs absent → contribution=0', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE }, makeCtx());
    expect(result.numeric_score).toBe(0);
  });

  it('14. Exact warm threshold: score=30 → warm', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k' }, makeCtx());
    expect(result.numeric_score).toBe(30);
    expect(result.score).toBe('warm');
  });

  it('15. Just under hot: score=55 → warm', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k', timeline: 'immediate' }, makeCtx());
    expect(result.numeric_score).toBe(55);
    expect(result.score).toBe('warm');
  });

  it('16. Exact hot threshold: 1-3months + 3needs + returning = 60 → hot', async () => {
    const result = await qualifyLeadModule.execute({
      ...BASE, timeline: '1-3months', need_count: 3, is_returning: true,
    }, makeCtx());
    expect(result.numeric_score).toBe(60);
    expect(result.score).toBe('hot');
  });

  it('17. Stage mapping: hot → proposal', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k', timeline: 'immediate', needs: ['x'] }, makeCtx());
    expect(result.score).toBe('hot');
    expect(result.stage).toBe('proposal');
  });

  it('18. Stage mapping: warm → qualifying', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$5k' }, makeCtx());
    expect(result.score).toBe('warm');
    expect(result.stage).toBe('qualifying');
  });

  it('19. Stage mapping: cold → new', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE }, makeCtx());
    expect(result.score).toBe('cold');
    expect(result.stage).toBe('new');
  });

  it('20. formatForLLM includes numeric score', () => {
    const output = {
      numeric_score: 75,
      score: 'hot' as const,
      stage: 'proposal' as const,
      tags: ['needs_budget'],
      next_action: 'offer_meeting',
      estimated_value: null,
    };
    const formatted = qualifyLeadModule.formatForLLM!(output);
    expect(formatted).toContain('Lead scored 75/100 (hot)');
    expect(formatted).toContain('Stage: proposal');
  });

  it('21. Backward compat: needs=["a","b"], no new fields → numeric_score=20, cold', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, needs: ['a', 'b'] }, makeCtx());
    expect(result.numeric_score).toBe(20);
    expect(result.score).toBe('cold');
  });

  it('22. Backward compat: budget + needs fallback → numeric_score=60, hot', async () => {
    const result = await qualifyLeadModule.execute({ ...BASE, budget: '$1k', needs: ['a', 'b', 'c'] }, makeCtx());
    expect(result.numeric_score).toBe(60);
    expect(result.score).toBe('hot');
  });
});
