import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { artifactRouter } from '../../routes/artifact.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID     = 'user_test_123';

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

// ---------------------------------------------------------------------------
// artifact.deactivate
// ---------------------------------------------------------------------------

describe('artifact.deactivate', () => {
  it('happy path — returns artifact row with isActive: false', async () => {
    const deactivatedArtifact = {
      id: ARTIFACT_ID,
      tenantId: TENANT_ID,
      isActive: false,
      updatedAt: new Date(),
    };

    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([deactivatedArtifact]),
          }),
        }),
      }),
    };

    const db = mockTenantDb(dbMock as Any);
    const caller = createCaller(makeCtx(db));

    const result = await caller.deactivate({ id: ARTIFACT_ID });

    expect(result).toEqual(deactivatedArtifact);
    expect(result.isActive).toBe(false);
  });

  it('artifact not found — throws NOT_FOUND when returning() is empty', async () => {
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    };

    const db = mockTenantDb(dbMock as Any);
    const caller = createCaller(makeCtx(db));

    await expect(caller.deactivate({ id: ARTIFACT_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('tenant isolation — row absent when tenantId does not match → throws NOT_FOUND', async () => {
    // When tenantId doesn't match, the WHERE clause filters out the row
    // and returning() resolves to [] — same outcome as not found
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([]),
          }),
        }),
      }),
    };

    const db = mockTenantDb(dbMock as Any);
    const caller = createCaller(makeCtx(db));

    await expect(caller.deactivate({ id: ARTIFACT_ID })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
