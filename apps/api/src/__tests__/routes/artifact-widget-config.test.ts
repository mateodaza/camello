import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { artifactRouter } from '../../routes/artifact.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(artifactRouter);

function mockTenantDb(queryImpl: (cb: Any) => Any): TenantDb {
  const wrappedQuery = async (cb: (tx: Any) => Any) => cb(queryImpl);
  return { query: wrappedQuery, transaction: wrappedQuery } as Any;
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

describe('artifact.update — widget config', () => {
  it('saves widget config to artifacts.config', async () => {
    let capturedSet: Any = null;

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      // No personality in input → select branch is skipped entirely
      // but we still mock select in case type-check path calls it
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: Any) => {
          capturedSet = data;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{
                id: ARTIFACT_ID,
                config: data.config,
              }]),
            }),
          };
        }),
      }),
    };

    const db = mockTenantDb(txMock as Any);
    const caller = createCaller(makeCtx(db));

    await caller.update({
      id: ARTIFACT_ID,
      config: { widgetPrimaryColor: '#FF5722', widgetPosition: 'bottom-left' },
    });

    expect(capturedSet.config).toEqual({
      widgetPrimaryColor: '#FF5722',
      widgetPosition: 'bottom-left',
    });
  });

  it('reads widget config back from returned artifact', async () => {
    const storedConfig = {
      widgetPrimaryColor: '#00897B',
      widgetPosition: 'bottom-right',
    };

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: ARTIFACT_ID,
              tenantId: TENANT_ID,
              name: 'Test Agent',
              type: 'sales',
              config: storedConfig,
              personality: {},
              constraints: {},
              escalation: {},
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }]),
          }),
        }),
      }),
    };

    const db = mockTenantDb(txMock as Any);
    const caller = createCaller(makeCtx(db));

    const result = await caller.byId({ id: ARTIFACT_ID });

    expect((result!.config as Record<string, unknown>).widgetPrimaryColor).toBe('#00897B');
    expect((result!.config as Record<string, unknown>).widgetPosition).toBe('bottom-right');
  });
});
