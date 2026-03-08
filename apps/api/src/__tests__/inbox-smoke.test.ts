import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// WhatsApp mock — conversationRouter statically imports whatsappAdapter;
// must be hoisted before the router import to prevent real HTTP calls.
// ---------------------------------------------------------------------------

const { mockSendText } = vi.hoisted(() => ({
  mockSendText: vi.fn(),
}));

vi.mock('../adapters/whatsapp.js', () => ({
  whatsappAdapter: { sendText: mockSendText, channel: 'whatsapp' },
}));

import { createCallerFactory } from '../trpc/init.js';
import { conversationRouter } from '../routes/conversation.js';
import { agentRouter } from '../routes/agent.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID       = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID     = '00000000-0000-0000-0000-000000000010';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000011';
const CUSTOMER_ID     = '00000000-0000-0000-0000-000000000099';
const USER_ID         = 'user_test_123';
const LEAD_ID         = '00000000-0000-0000-0000-000000000050';
const MESSAGE_ID      = '00000000-0000-0000-0000-000000000070';
const NOTIF_ID        = '00000000-0000-0000-0000-000000000080';
const CONV_ID         = '00000000-0000-0000-0000-000000000090';

// createCallerFactory at module level — identical pattern to learning-routes.test.ts line 16
const createConversationCaller = createCallerFactory(conversationRouter);
const createAgentCaller        = createCallerFactory(agentRouter);

// PgDialect — same SQL param extraction used by conversation-list-filters.test.ts
const dialect = new PgDialect();
function getWhereParams(sqlNode: Any): unknown[] {
  return dialect.sqlToQuery(sqlNode as Any).params;
}

// Cycle-safe serializer for Drizzle predicate nodes — same as agent-dashboard.test.ts
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

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

// makeCtx includes userFullName — required by replyAsOwner to build authorName
function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    userFullName: 'Alice Owner',
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// makeConvRow — baseline row shape for conversation.list results
function makeConvRow(id: string = CONVERSATION_ID) {
  return {
    id,
    artifactId: ARTIFACT_ID,
    customerId: CUSTOMER_ID,
    channel: 'web_chat',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    customerName: 'Alice',
    customerExternalId: 'ext-1',
    summary: null,
  };
}

// makeMockDb — vi.fn() spy on .where() for SQL param inspection;
// same pattern as conversation-list-filters.test.ts
function makeMockDb(rows: Any[]): { db: TenantDb; whereSpy: ReturnType<typeof vi.fn> } {
  const whereSpy = vi.fn();
  const chain: Any = {
    from: () => chain,
    leftJoin: () => chain,
    where: (...args: Any[]) => {
      whereSpy(...args);
      return chain;
    },
    orderBy: () => chain,
    limit: async () => rows,
  };
  const rawDb = { select: () => chain };
  const db: TenantDb = {
    query: async (fn: Any) => fn(rawDb),
    transaction: async (fn: Any) => fn(rawDb),
  } as Any;
  return { db, whereSpy };
}

// ---------------------------------------------------------------------------
// Timestamps used across tests
// ---------------------------------------------------------------------------

const T1 = new Date('2026-01-01T00:00:10Z'); // earlier
const T2 = new Date('2026-01-01T00:00:20Z'); // later

const TA1 = new Date('2026-01-01T10:00:00Z'); // earlier
const TA2 = new Date('2026-01-01T11:00:00Z'); // later

// ---------------------------------------------------------------------------
// AC 1 — conversation.activity (NC-202)
// ---------------------------------------------------------------------------

describe('inbox smoke — conversation.activity (NC-202)', () => {
  it('Test 1: happy path — returns merged module executions + stage changes, sorted ASC', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            // Query 1: module executions leftJoin modules
            return {
              from: () => ({
                leftJoin: () => ({
                  where: () => ({
                    orderBy: () => [
                      {
                        moduleSlug: 'qualify_lead',
                        moduleName: 'Qualify Lead',
                        input: {},
                        output: {},
                        createdAt: T1,
                      },
                    ],
                  }),
                }),
              }),
            };
          }
          if (selectCount === 2) {
            // Query 2: lead lookup by conversationId
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ id: LEAD_ID }],
                }),
              }),
            };
          }
          // Query 3: stage changes by leadId
          return {
            from: () => ({
              where: () => ({
                orderBy: () => [
                  {
                    fromStage: 'new',
                    toStage: 'qualified',
                    createdAt: T2,
                  },
                ],
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const result = await createConversationCaller(makeCtx(db)).activity({
      conversationId: CONVERSATION_ID,
    });

    expect(result).toHaveLength(2);
    // T1 < T2 → execution at T1 is first
    expect(result[0].type).toBe('execution');
    expect(result[1].type).toBe('stage_change');
    expect(result[0].moduleSlug).toBe('qualify_lead');
    expect(result[1].fromStage).toBe('new');
    expect(result[1].toStage).toBe('qualified');
  });

  it('Test 2: empty — no executions, no lead → returns []', async () => {
    let selectCount = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                leftJoin: () => ({
                  where: () => ({
                    orderBy: () => [],
                  }),
                }),
              }),
            };
          }
          // leads query returns empty — no stage-changes query issued
          return {
            from: () => ({
              where: () => ({
                limit: () => [],
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const result = await createConversationCaller(makeCtx(db)).activity({
      conversationId: CONVERSATION_ID,
    });

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// AC 2 — conversation.replyAsOwner (NC-203)
// ---------------------------------------------------------------------------

describe('inbox smoke — conversation.replyAsOwner (NC-203)', () => {
  it('Test 3: happy path — inserts role:human message with authorName from ctx', async () => {
    const insertedMessages: Any[] = [];
    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            // tenant_members role check
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          // conversation lookup (leftJoin customers)
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [
                    {
                      id: CONVERSATION_ID,
                      status: 'escalated',
                      channel: 'web_chat',
                      customerExternalId: null,
                    },
                  ],
                }),
              }),
            }),
          };
        },
        insert: () => ({
          values: (data: Any) => {
            insertedMessages.push(data);
            return {
              returning: () => [
                {
                  id: MESSAGE_ID,
                  role: data.role,
                  content: data.content,
                  metadata: data.metadata,
                  conversationId: CONVERSATION_ID,
                  createdAt: new Date(),
                },
              ],
            };
          },
        }),
      };
      return fn(mockDb);
    });

    const result = await createConversationCaller(makeCtx(db)).replyAsOwner({
      conversationId: CONVERSATION_ID,
      message: 'Hello customer',
    });

    expect(insertedMessages[0].role).toBe('human');
    expect(insertedMessages[0].metadata.authorName).toBe('Alice Owner');
    expect(insertedMessages[0].content).toBe('Hello customer');
    expect(result.id).toBe(MESSAGE_ID);
  });

  it('Test 4: non-escalated guard — throws PRECONDITION_FAILED', async () => {
    let selectCount = 0;

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          selectCount++;
          if (selectCount === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          // conversation with status: 'active' (not escalated)
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [
                    {
                      id: CONVERSATION_ID,
                      status: 'active',
                      channel: 'web_chat',
                      customerExternalId: null,
                    },
                  ],
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    await expect(
      createConversationCaller(makeCtx(db)).replyAsOwner({
        conversationId: CONVERSATION_ID,
        message: 'Hi',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

// ---------------------------------------------------------------------------
// AC 3 — conversation.list (NC-204)
// ---------------------------------------------------------------------------

describe('inbox smoke — conversation.list (NC-204)', () => {
  it("Test 5: COALESCE'd customerName — display name is human-readable (not raw UUID)", async () => {
    const { db } = makeMockDb([{ ...makeConvRow(), customerName: 'Visitor 3' }]);

    const result = await createConversationCaller(makeCtx(db)).list({ limit: 10 });

    expect(result.items[0].customerName).toBe('Visitor 3');
    // Prove the name is not a raw visitor_* UUID (NC-204 backfill concern)
    expect(result.items[0].customerName).not.toMatch(/^visitor_[a-f0-9]+$/i);
  });

  it('Test 6: artifactId filter — WHERE params include ARTIFACT_ID', async () => {
    const { db, whereSpy } = makeMockDb([makeConvRow()]);

    const result = await createConversationCaller(makeCtx(db)).list({
      artifactId: ARTIFACT_ID,
      limit: 10,
    });

    expect(whereSpy).toHaveBeenCalledOnce();
    const params = getWhereParams(whereSpy.mock.calls[0][0]);
    expect(params).toContain(ARTIFACT_ID);
    expect(result.items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AC 4 — agent.dashboardActivityFeed (NC-212) — both filter paths
// ---------------------------------------------------------------------------

describe('inbox smoke — agent.dashboardActivityFeed (NC-212)', () => {
  it('Test 7: artifactId supplied — WHERE predicates for both queries include ARTIFACT_ID', async () => {
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
                          ? [
                              {
                                id: NOTIF_ID,
                                type: 'hot_lead',
                                title: 'Hot Lead',
                                body: '',
                                artifactId: ARTIFACT_ID,
                                artifactName: 'Sales Bot',
                                createdAt: TA1,
                              },
                            ]
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

    const result = await createAgentCaller(makeCtx(db)).dashboardActivityFeed({
      artifactId: ARTIFACT_ID,
    });

    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('new_lead');
    // Both the notifications query and conversations query must filter by artifactId
    expect(capturedPredicates).toHaveLength(2);
    expect(safeStringify(capturedPredicates[0])).toContain(ARTIFACT_ID);
    expect(safeStringify(capturedPredicates[1])).toContain(ARTIFACT_ID);
  });

  it('Test 8: {} (no artifactId) — WHERE predicates do NOT contain ARTIFACT_ID', async () => {
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
                          ? [
                              {
                                id: NOTIF_ID,
                                type: 'approval_needed',
                                title: 'Approval',
                                body: '',
                                artifactId: ARTIFACT_ID,
                                artifactName: 'Bot',
                                createdAt: TA2,
                              },
                            ]
                          : [
                              {
                                id: CONV_ID,
                                artifactId: ARTIFACT_ID,
                                artifactName: 'Bot',
                                resolvedAt: TA1,
                              },
                            ],
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

    // Empty object {} — exercises the optional path (no artifactId filter applied)
    const result = await createAgentCaller(makeCtx(db)).dashboardActivityFeed({});

    expect(result.events).toHaveLength(2);
    // TA2 > TA1 → approval_needed (TA2) is newest-first
    expect(result.events[0].eventType).toBe('approval_needed');
    expect(result.events[1].eventType).toBe('conversation_resolved');

    // When no artifactId is supplied, the WHERE predicates must NOT include an
    // artifact-specific filter. TENANT_ID ('...000001') will appear; ARTIFACT_ID
    // ('...000010') must not (they differ in the last two hex digits).
    expect(capturedPredicates).toHaveLength(2);
    const notifStr = safeStringify(capturedPredicates[0]);
    const convStr  = safeStringify(capturedPredicates[1]);
    expect(notifStr).not.toContain(ARTIFACT_ID);
    expect(convStr).not.toContain(ARTIFACT_ID);
    // Tenant scoping still applied — tenantId appears in both predicates
    expect(notifStr).toContain(TENANT_ID);
    expect(convStr).toContain(TENANT_ID);
  });
});
