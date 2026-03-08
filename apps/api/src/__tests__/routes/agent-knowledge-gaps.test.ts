import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID     = 'user_test_123';

const createCaller = createCallerFactory(agentRouter);

function mockTenantDb(executeResult: { rows: Any[] }): TenantDb {
  return {
    query: async (fn: Any) => fn({ execute: async () => executeResult }),
    transaction: async (fn: Any) => fn({ execute: async () => executeResult }),
  } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    tenantId: TENANT_ID,
    tenantDb,
  };
}

describe('agent.supportKnowledgeGaps', () => {
  it('happy path with sample question', async () => {
    const db = mockTenantDb({
      rows: [
        { intent: 'pricing', count: 5, last_seen: '2026-03-01T00:00:00Z', sample_question: 'What does it cost?' },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.supportKnowledgeGaps({ artifactId: ARTIFACT_ID });

    expect(result).toEqual([{
      intent: 'pricing',
      count: 5,
      lastSeen: '2026-03-01T00:00:00Z',
      sampleQuestion: 'What does it cost?',
    }]);
  });

  it('null sample question maps to null', async () => {
    const db = mockTenantDb({
      rows: [
        { intent: 'returns', count: 3, last_seen: '2026-03-01T00:00:00Z', sample_question: null },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.supportKnowledgeGaps({ artifactId: ARTIFACT_ID });

    expect(result[0].sampleQuestion).toBeNull();
  });

  it('multiple gaps returned in count-descending order', async () => {
    const db = mockTenantDb({
      rows: [
        { intent: 'pricing', count: 8, last_seen: '2026-03-01T00:00:00Z', sample_question: 'How much?' },
        { intent: 'refunds', count: 2, last_seen: '2026-03-01T00:00:00Z', sample_question: null },
      ],
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.supportKnowledgeGaps({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0].intent).toBe('pricing');
  });

  it('empty result when no gaps in 30 days', async () => {
    const db = mockTenantDb({ rows: [] });

    const caller = createCaller(makeCtx(db));
    const result = await caller.supportKnowledgeGaps({ artifactId: ARTIFACT_ID });

    expect(result).toEqual([]);
  });
});
