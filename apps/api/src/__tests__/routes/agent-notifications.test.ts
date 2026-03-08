import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID       = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID     = '00000000-0000-0000-0000-000000000002';
const NOTIFICATION_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID         = 'user_test_123';

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

// ---------------------------------------------------------------------------
// agent.ownerNotifications
// ---------------------------------------------------------------------------

describe('agent.ownerNotifications', () => {
  it('returns notifications and unreadCount from DB', async () => {
    const fakeRows = [
      { id: NOTIFICATION_ID, message: 'test1', readAt: null },
      { id: '00000000-0000-0000-0000-000000000011', message: 'test2', readAt: null },
    ];

    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => fakeRows,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              where: () => [{ count: 1 }],
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.ownerNotifications({ artifactId: ARTIFACT_ID });

    expect(result.notifications.length).toBe(2);
    expect(result.unreadCount).toBe(1);
  });

  it('returns empty notifications and zero unreadCount', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => [],
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              where: () => [{ count: 0 }],
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.ownerNotifications({ artifactId: ARTIFACT_ID });

    expect(result.notifications).toEqual([]);
    expect(result.unreadCount).toBe(0);
  });

  it('falls back to 0 when count query returns empty array', async () => {
    const fakeRows = [{ id: NOTIFICATION_ID, message: 'test' }];

    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => fakeRows,
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              where: () => [],
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.ownerNotifications({ artifactId: ARTIFACT_ID });

    expect(result.unreadCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// agent.markNotificationRead
// ---------------------------------------------------------------------------

describe('agent.markNotificationRead', () => {
  it('calls update on the DB', async () => {
    const updateSpy = vi.fn(() => ({
      set: () => ({
        where: () => undefined,
      }),
    }));

    const db = mockTenantDb(async (fn: Any) => {
      return fn({ update: updateSpy });
    });

    const caller = createCaller(makeCtx(db));
    await caller.markNotificationRead({ notificationId: NOTIFICATION_ID });

    expect(updateSpy).toHaveBeenCalled();
  });

  it('resolves to undefined even when no rows are updated', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      return fn({
        update: () => ({
          set: () => ({
            where: () => undefined,
          }),
        }),
      });
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.markNotificationRead({ notificationId: NOTIFICATION_ID });

    expect(result).toBeUndefined();
  });

  it('throws a validation error for invalid UUID', async () => {
    const db = mockTenantDb(async (fn: Any) => fn({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.markNotificationRead({ notificationId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// agent.markAllNotificationsRead
// ---------------------------------------------------------------------------

describe('agent.markAllNotificationsRead', () => {
  it('calls update on the DB', async () => {
    const updateSpy = vi.fn(() => ({
      set: () => ({
        where: () => undefined,
      }),
    }));

    const db = mockTenantDb(async (fn: Any) => {
      return fn({ update: updateSpy });
    });

    const caller = createCaller(makeCtx(db));
    await caller.markAllNotificationsRead({ artifactId: ARTIFACT_ID });

    expect(updateSpy).toHaveBeenCalled();
  });

  it('resolves without error when nothing to mark', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      return fn({
        update: () => ({
          set: () => ({
            where: () => undefined,
          }),
        }),
      });
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.markAllNotificationsRead({ artifactId: ARTIFACT_ID });

    expect(result).toBeUndefined();
  });

  it('throws a validation error for invalid UUID', async () => {
    const db = mockTenantDb(async (fn: Any) => fn({}));
    const caller = createCaller(makeCtx(db));

    await expect(
      caller.markAllNotificationsRead({ artifactId: 'bad-id' }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// agent.unreadNotificationCount
// ---------------------------------------------------------------------------

describe('agent.unreadNotificationCount', () => {
  it('returns count from DB', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => [{ count: 5 }],
          }),
        }),
      });
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.unreadNotificationCount({ artifactId: ARTIFACT_ID });

    expect(result.count).toBe(5);
  });

  it('returns 0 when count is zero', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => [{ count: 0 }],
          }),
        }),
      });
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.unreadNotificationCount({ artifactId: ARTIFACT_ID });

    expect(result.count).toBe(0);
  });

  it('returns 0 via fallback when DB returns empty array', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      return fn({
        select: () => ({
          from: () => ({
            where: () => [],
          }),
        }),
      });
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.unreadNotificationCount({ artifactId: ARTIFACT_ID });

    expect(result.count).toBe(0);
  });
});
