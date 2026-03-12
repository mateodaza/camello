import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID     = 'user_test_123';

const createCaller = createCallerFactory(agentRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
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

function makeGapRow(intentType: string, sampleQuestion: string) {
  return {
    id: `gap-${intentType}`,
    tenantId: TENANT_ID,
    artifactId: ARTIFACT_ID,
    type: 'knowledge_gap',
    title: `Knowledge gap: ${intentType}`,
    body: `Customer asked: "${sampleQuestion}"`,
    metadata: { intentType, sampleQuestion },
    readAt: null,
    createdAt: new Date('2026-03-11T10:00:00.000Z'),
    updatedAt: new Date('2026-03-11T10:00:00.000Z'),
  };
}

// ---------------------------------------------------------------------------
// agent.knowledgeGapNotifications
// ---------------------------------------------------------------------------

describe('agent.knowledgeGapNotifications', () => {
  it('NC-237-8: returns knowledge_gap rows filtered by artifactId', async () => {
    const rows = [
      makeGapRow('product_inquiry', 'What is the price?'),
      makeGapRow('return_policy', 'Can I return this?'),
    ];

    const tenantDb = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => rows,
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(tenantDb));
    const result = await caller.knowledgeGapNotifications({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'gap-product_inquiry',
      type: 'knowledge_gap',
      metadata: { intentType: 'product_inquiry', sampleQuestion: 'What is the price?' },
      createdAt: expect.any(Date),
    });
    expect(result[1]).toMatchObject({
      id: 'gap-return_policy',
      type: 'knowledge_gap',
    });
  });

  it('NC-237-9: returns empty array when no gaps exist', async () => {
    const tenantDb = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => [],
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(tenantDb));
    const result = await caller.knowledgeGapNotifications({ artifactId: ARTIFACT_ID });

    expect(result).toEqual([]);
  });
});
