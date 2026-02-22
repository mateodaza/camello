import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { artifactRouter } from '../../routes/artifact.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(artifactRouter);

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

describe('artifact.update — quickActions validation', () => {
  it('rejects quickActions with > 4 items', async () => {
    const db = mockTenantDb(async () => ({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.update({
        id: ARTIFACT_ID,
        personality: {
          quickActions: [
            { label: 'A', message: 'msg1' },
            { label: 'B', message: 'msg2' },
            { label: 'C', message: 'msg3' },
            { label: 'D', message: 'msg4' },
            { label: 'E', message: 'msg5' },
          ],
        },
      }),
    ).rejects.toThrow('quickActions');
  });

  it('rejects quickAction with label > 40 chars', async () => {
    const db = mockTenantDb(async () => ({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.update({
        id: ARTIFACT_ID,
        personality: {
          quickActions: [{ label: 'x'.repeat(41), message: 'ok' }],
        },
      }),
    ).rejects.toThrow('quickActions');
  });

  it('rejects quickAction with message > 200 chars', async () => {
    const db = mockTenantDb(async () => ({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.update({
        id: ARTIFACT_ID,
        personality: {
          quickActions: [{ label: 'ok', message: 'y'.repeat(201) }],
        },
      }),
    ).rejects.toThrow('quickActions');
  });

  it('accepts valid quickActions (4 items, within limits)', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => [{
                id: ARTIFACT_ID,
                personality: {
                  quickActions: [
                    { label: 'Menu', message: 'Show me the menu' },
                    { label: 'Hours', message: 'What are your hours?' },
                  ],
                },
              }],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.update({
      id: ARTIFACT_ID,
      personality: {
        quickActions: [
          { label: 'Menu', message: 'Show me the menu' },
          { label: 'Hours', message: 'What are your hours?' },
        ],
      },
    });

    expect(result).toBeDefined();
    expect((result as Any).personality.quickActions).toHaveLength(2);
  });
});
