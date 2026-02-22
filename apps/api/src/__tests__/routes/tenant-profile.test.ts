import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { tenantRouter } from '../../routes/index.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(tenantRouter) as Any;

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
  } as Any;
}

describe('tenant.updateProfile', () => {
  it('merges patch over existing profile — omitted fields preserved', async () => {
    let callCount = 0;
    const trackedDb = mockTenantDb(async (fn: Any) => {
      callCount++;
      if (callCount === 1) {
        // Read existing settings
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [{
                  settings: { profile: { tagline: 'Old tagline', bio: 'Existing bio', location: 'Bogotá' } },
                }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      }
      // Write merged
      const mockDb = {
        update: () => ({
          set: () => ({ where: () => ({}) }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(trackedDb));
    const result = await caller.updateProfile({ bio: 'New bio' });

    // Merged result: tagline + location preserved, bio updated
    expect(result.tagline).toBe('Old tagline');
    expect(result.bio).toBe('New bio');
    expect(result.location).toBe('Bogotá');
  });

  it('rejects http:// avatar URL', async () => {
    const db = mockTenantDb(async () => ({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.updateProfile({ avatarUrl: 'http://example.com/logo.png' }),
    ).rejects.toThrow();
  });

  it('rejects http:// social link URL', async () => {
    const db = mockTenantDb(async () => ({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.updateProfile({
        socialLinks: [{ platform: 'twitter', url: 'http://twitter.com/test' }],
      }),
    ).rejects.toThrow();
  });

  it('rejects more than 6 social links', async () => {
    const db = mockTenantDb(async () => ({}));
    const caller = createCaller(makeCtx(db));

    const sevenLinks = Array.from({ length: 7 }, (_, i) => ({
      platform: 'website',
      url: `https://example${i}.com`,
    }));

    await expect(
      caller.updateProfile({ socialLinks: sevenLinks }),
    ).rejects.toThrow();
  });

  it('accepts empty update — preserves existing', async () => {
    let callCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      callCount++;
      if (callCount === 1) {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [{ settings: { profile: { tagline: 'Existing' } } }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      }
      const mockDb = {
        update: () => ({ set: () => ({ where: () => ({}) }) }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.updateProfile({});

    expect(result.tagline).toBe('Existing');
  });

  it('allows empty string for avatarUrl (clears it)', async () => {
    let callCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      callCount++;
      if (callCount === 1) {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [{ settings: { profile: { avatarUrl: 'https://old.com/logo.png' } } }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      }
      const mockDb = {
        update: () => ({ set: () => ({ where: () => ({}) }) }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.updateProfile({ avatarUrl: '' });

    // Empty string → null (clears avatar)
    expect(result.avatarUrl).toBeNull();
  });
});
