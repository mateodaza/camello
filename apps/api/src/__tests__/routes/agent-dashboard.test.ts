import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const NOTIF_ID_1  = '00000000-0000-0000-0000-000000000010';
const NOTIF_ID_2  = '00000000-0000-0000-0000-000000000011';
const CONV_ID_1   = '00000000-0000-0000-0000-000000000020';
const CONV_ID_2   = '00000000-0000-0000-0000-000000000021';
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

// ---------------------------------------------------------------------------
// agent.dashboardOverview
// ---------------------------------------------------------------------------

describe('agent.dashboardOverview', () => {
  it('happy path — all 5 counts return non-zero values', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          return {
            from: () => ({
              where: () => {
                if (selectCount === 1) return [{ count: 3 }];
                if (selectCount === 2) return [{ count: 12 }];
                if (selectCount === 3) return [{ count: 5 }];
                if (selectCount === 4) return [{ count: 2 }];
                return [{ count: 7 }];
              },
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardOverview();

    expect(result.todayConversations).toBe(3);
    expect(result.weekConversations).toBe(12);
    expect(result.unreadNotificationsCount).toBe(5);
    expect(result.pendingApprovalsCount).toBe(2);
    expect(result.activeLeadsCount).toBe(7);
  });

  it('empty tenant — all counts return 0', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => [{ count: 0 }],
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardOverview();

    expect(result.todayConversations).toBe(0);
    expect(result.weekConversations).toBe(0);
    expect(result.unreadNotificationsCount).toBe(0);
    expect(result.pendingApprovalsCount).toBe(0);
    expect(result.activeLeadsCount).toBe(0);
  });

  it('count query returns empty array — fallback to 0 for all fields', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => [],
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardOverview();

    expect(result.todayConversations).toBe(0);
    expect(result.weekConversations).toBe(0);
    expect(result.unreadNotificationsCount).toBe(0);
    expect(result.pendingApprovalsCount).toBe(0);
    expect(result.activeLeadsCount).toBe(0);
  });

  it('only pendingApprovals non-zero — pendingApprovalsCount is 3, others 0', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          return {
            from: () => ({
              where: () => {
                if (selectCount === 4) return [{ count: 3 }];
                return [{ count: 0 }];
              },
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardOverview();

    expect(result.todayConversations).toBe(0);
    expect(result.weekConversations).toBe(0);
    expect(result.unreadNotificationsCount).toBe(0);
    expect(result.pendingApprovalsCount).toBe(3);
    expect(result.activeLeadsCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// agent.dashboardActivityFeed
// ---------------------------------------------------------------------------

const T3 = new Date('2024-01-04T12:00:00Z');
const T2 = new Date('2024-01-03T12:00:00Z');
const T1 = new Date('2024-01-02T12:00:00Z');
const T0 = new Date('2024-01-01T12:00:00Z');

// Drizzle SQL expression objects contain circular references (Column → Table → Column).
// This helper serialises the predicate while breaking cycles, so we can search for
// param values (UUIDs) embedded in the expression tree.
function safeStringify(obj: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(obj, (_key, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value as object)) return undefined;
      seen.add(value as object);
    }
    return value;
  }) ?? '';
}

describe('agent.dashboardActivityFeed', () => {
  it('happy path — merged and ordered newest-first', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => [
                        { id: NOTIF_ID_1, type: 'hot_lead', title: 'Hot Lead', body: '', artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', createdAt: T3 },
                        { id: NOTIF_ID_2, type: 'approval_needed', title: 'Approval', body: '', artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', createdAt: T1 },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => [
                      { id: CONV_ID_1, artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', resolvedAt: T2 },
                      { id: CONV_ID_2, artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', resolvedAt: T0 },
                    ],
                  }),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed();

    expect(result.events.length).toBe(4);
    expect(result.events[0].eventType).toBe('new_lead');
    expect(result.events[0].createdAt).toEqual(T3);
    expect(result.events[1].eventType).toBe('conversation_resolved');
    expect(result.events[1].createdAt).toEqual(T2);
    expect(result.events[2].eventType).toBe('approval_needed');
    expect(result.events[2].createdAt).toEqual(T1);
    expect(result.events[3].eventType).toBe('conversation_resolved');
    expect(result.events[3].createdAt).toEqual(T0);
  });

  it('limit=10 enforced — 8 notifications + 8 conversations = 10 events', async () => {
    const makeNotifRow = (i: number) => ({
      id: `notif-${i}`,
      type: 'hot_lead',
      title: 'Lead',
      body: '',
      artifactId: ARTIFACT_ID,
      artifactName: 'Bot',
      createdAt: new Date(Date.now() - i * 1000),
    });
    const makeConvRow = (i: number) => ({
      id: `conv-${i}`,
      artifactId: ARTIFACT_ID,
      artifactName: 'Bot',
      resolvedAt: new Date(Date.now() - (i + 100) * 1000),
    });

    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => Array.from({ length: 8 }, (_, i) => makeNotifRow(i)),
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => Array.from({ length: 8 }, (_, i) => makeConvRow(i)),
                  }),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed();

    expect(result.events.length).toBe(10);
  });

  it('only notifications, no resolved conversations', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => [
                        { id: NOTIF_ID_1, type: 'hot_lead', title: 'Lead', body: '', artifactId: ARTIFACT_ID, artifactName: 'Bot', createdAt: T3 },
                        { id: NOTIF_ID_2, type: 'deal_closed', title: 'Deal', body: '', artifactId: ARTIFACT_ID, artifactName: 'Bot', createdAt: T2 },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => [],
                  }),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed();

    expect(result.events.length).toBe(2);
    for (const event of result.events) {
      expect(['new_lead', 'approval_needed', 'deal_closed']).toContain(event.eventType);
    }
  });

  it('only resolved conversations, no notifications', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => [],
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => [
                      { id: CONV_ID_1, artifactId: ARTIFACT_ID, artifactName: 'Bot', resolvedAt: T2 },
                    ],
                  }),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed();

    expect(result.events.length).toBe(1);
    expect(result.events[0].eventType).toBe('conversation_resolved');
    expect(result.events[0].createdAt).toEqual(T2);
  });

  it('artifactId filter — WHERE predicate includes artifactId condition for both queries', async () => {
    // Capture the WHERE predicate passed to both DB queries so we can assert the
    // artifactId filter is actually forwarded (not just that the mocked result has
    // the right shape, which would pass even if the filter were removed).
    const capturedPredicates: unknown[] = [];
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          const idx = selectCount;
          return {
            from: () => ({
              innerJoin: () => ({
                where: (predicate: unknown) => {
                  capturedPredicates.push(predicate);
                  return {
                    orderBy: () => ({
                      limit: () =>
                        idx === 1
                          ? [{ id: NOTIF_ID_1, type: 'hot_lead', title: 'Hot Lead', body: '', artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', createdAt: T1 }]
                          : [],
                    }),
                  };
                },
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed({ artifactId: ARTIFACT_ID });

    expect(result.events.length).toBe(1);
    expect(result.events[0].eventType).toBe('new_lead');
    expect(result.events[0].artifactId).toBe(ARTIFACT_ID);

    // Both the notifications query and conversations query must include the
    // artifactId condition. Drizzle's eq() stores the value in a Param chunk,
    // which JSON.stringify serialises as {"value":"<uuid>",...} — so the UUID
    // must be present in the serialised predicate.
    expect(capturedPredicates).toHaveLength(2);
    const [notifPredicate, convPredicate] = capturedPredicates.map(safeStringify);
    expect(notifPredicate).toContain(ARTIFACT_ID);
    expect(convPredicate).toContain(ARTIFACT_ID);
  });

  it('empty input {} — WHERE predicate does not include any artifactId condition', async () => {
    const capturedPredicates: unknown[] = [];
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          const idx = selectCount;
          return {
            from: () => ({
              innerJoin: () => ({
                where: (predicate: unknown) => {
                  capturedPredicates.push(predicate);
                  return {
                    orderBy: () => ({
                      limit: () =>
                        idx === 1
                          ? [{ id: NOTIF_ID_2, type: 'approval_needed', title: 'Approval', body: '', artifactId: ARTIFACT_ID, artifactName: 'Bot', createdAt: T2 }]
                          : [{ id: CONV_ID_1, artifactId: ARTIFACT_ID, artifactName: 'Bot', resolvedAt: T1 }],
                    }),
                  };
                },
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed({});

    expect(result.events.length).toBe(2);
    expect(result.events[0].eventType).toBe('approval_needed');
    expect(result.events[1].eventType).toBe('conversation_resolved');

    // When no artifactId is supplied the WHERE predicates must NOT include an
    // artifact-specific filter (only tenantId and other fixed conditions).
    // TENANT_ID ('...000001') will appear; ARTIFACT_ID ('...000002') must not.
    expect(capturedPredicates).toHaveLength(2);
    const [notifPredicate, convPredicate] = capturedPredicates.map(safeStringify);
    expect(notifPredicate).not.toContain(ARTIFACT_ID);
    expect(convPredicate).not.toContain(ARTIFACT_ID);
  });

  it('hot_lead mapped to new_lead; lead_stale excluded by inArray filter', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            // Simulate DB respecting the inArray filter: only hot_lead row returned
            // lead_stale would not be returned by the real DB (filtered by WHERE clause)
            return {
              from: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () => [
                        { id: NOTIF_ID_1, type: 'hot_lead', title: 'Hot Lead', body: '', artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', createdAt: T1 },
                      ],
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            from: () => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => [],
                  }),
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.dashboardActivityFeed();

    expect(result.events.length).toBe(1);
    expect(result.events[0].eventType).toBe('new_lead');
    expect(result.events[0].artifactName).toBe('Sales Bot');

    // lead_stale must not appear
    const leadStaleEvents = result.events.filter((e) => e.eventType === ('lead_stale' as Any));
    expect(leadStaleEvents.length).toBe(0);
  });
});
