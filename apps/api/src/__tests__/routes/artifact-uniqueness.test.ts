import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { artifactRouter } from '../../routes/artifact.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(artifactRouter);

/**
 * mockTenantDb — simulates the tenantDb abstraction.
 * Both `query` and `transaction` call the same impl,
 * which receives the "tx/db" facade as its first argument.
 */
function mockTenantDb(queryImpl: (cb: Any) => Any): TenantDb {
  // The caller passes an async callback; we invoke it with a mock tx
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
// enforceUniqueArtifactType — unit tests
// ---------------------------------------------------------------------------

describe('enforceUniqueArtifactType', () => {
  it('throws CONFLICT when an artifact of the same type exists', async () => {
    const { enforceUniqueArtifactType } = await import(
      '../../lib/enforce-unique-artifact-type.js'
    );

    const mockTx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'existing-id' }]),
          }),
        }),
      }),
    } as Any;

    await expect(
      enforceUniqueArtifactType(mockTx, TENANT_ID, 'sales'),
    ).rejects.toThrow('An artifact of this type already exists');
  });

  it('passes when no artifact of the same type exists', async () => {
    const { enforceUniqueArtifactType } = await import(
      '../../lib/enforce-unique-artifact-type.js'
    );

    const mockTx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as Any;

    await expect(
      enforceUniqueArtifactType(mockTx, TENANT_ID, 'sales'),
    ).resolves.toBeUndefined();
  });

  it('passes when excludeId matches the existing artifact', async () => {
    const { enforceUniqueArtifactType } = await import(
      '../../lib/enforce-unique-artifact-type.js'
    );

    // When excludeId is provided, the WHERE clause filters it out —
    // so the query returns empty even though an artifact exists
    const mockTx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as Any;

    await expect(
      enforceUniqueArtifactType(mockTx, TENANT_ID, 'sales', ARTIFACT_ID),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// artifact.create — wraps in transaction with uniqueness guard
// ---------------------------------------------------------------------------

describe('artifact.create — uniqueness', () => {
  it('creates an artifact when no duplicate exists', async () => {
    const newArtifact = {
      id: ARTIFACT_ID,
      name: 'Sales Assistant',
      type: 'sales',
      tenantId: TENANT_ID,
    };

    // where() must be both thenable (for applyArchetypeDefaults: await ...where())
    // and have .limit() (for enforceUniqueArtifactType: ...where().limit())
    const makeWhereResult = (rows: Any[]) => {
      const result = Promise.resolve(rows);
      (result as Any).limit = vi.fn().mockResolvedValue(rows);
      return result;
    };

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue(makeWhereResult([])),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newArtifact]),
        }),
      }),
    };

    const db = mockTenantDb(txMock as Any);
    const caller = createCaller(makeCtx(db));

    // sales type with empty moduleRows → strict slug guard throws.
    // But `custom` type has no modules, so applyArchetypeDefaults is a no-op.
    const result = await caller.create({
      name: 'Custom Assistant',
      type: 'custom',
    });

    expect(result).toEqual(newArtifact);
    expect(txMock.execute).toHaveBeenCalled(); // advisory lock
    expect(txMock.insert).toHaveBeenCalled();
  });

  it('rejects creation when duplicate type exists', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'existing-sales' }]),
          }),
        }),
      }),
    };

    const db = mockTenantDb(txMock as Any);
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.create({ name: 'Sales V2', type: 'sales' }),
    ).rejects.toThrow('An artifact of this type already exists');
  });
});

// ---------------------------------------------------------------------------
// artifact.update — personality merge
// ---------------------------------------------------------------------------

describe('artifact.update — personality merge', () => {
  it('merges personality server-side (preserves quickActions when updating greeting)', async () => {
    const existingPersonality = {
      greeting: 'Old greeting',
      tone: 'friendly',
      quickActions: [{ label: 'Price', message: 'What are your prices?' }],
      language: 'en',
    };

    let capturedSet: Any = null;

    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      // For the personality read in update
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ personality: existingPersonality }]),
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
                personality: { ...existingPersonality, ...data.personality },
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
      personality: { greeting: 'New greeting' },
    });

    // Verify the merged personality includes both new greeting AND old quickActions
    expect(capturedSet.personality).toEqual({
      greeting: 'New greeting',
      tone: 'friendly',
      quickActions: [{ label: 'Price', message: 'What are your prices?' }],
      language: 'en',
    });
  });

  it('calls enforceUniqueArtifactType when type is changed', async () => {
    const txMock = {
      execute: vi.fn().mockResolvedValue(undefined),
      // uniqueness check returns empty (no duplicate)
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: ARTIFACT_ID, type: 'support' }]),
          }),
        }),
      }),
    };

    const db = mockTenantDb(txMock as Any);
    const caller = createCaller(makeCtx(db));

    await caller.update({ id: ARTIFACT_ID, type: 'support' });

    // Advisory lock was called (for uniqueness enforcement)
    expect(txMock.execute).toHaveBeenCalled();
  });
});
