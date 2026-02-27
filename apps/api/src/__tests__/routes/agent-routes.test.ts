import { describe, it, expect, vi } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const TARGET_ARTIFACT_ID = '00000000-0000-0000-0000-000000000003';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000004';
const USER_ID = 'user_test_123';

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
// workspace
// ---------------------------------------------------------------------------

describe('agent.workspace', () => {
  it('returns artifact + modules + metrics + automationScore', async () => {
    const fakeArtifact = { id: ARTIFACT_ID, name: 'Sales Bot', type: 'sales', tenantId: TENANT_ID };
    const fakeBoundModules = [
      { id: 'am-1', moduleId: 'm-1', autonomyLevel: 'fully_autonomous', autonomySource: 'default', configOverrides: {}, slug: 'qualify_lead', name: 'Qualify Lead', category: 'sales' },
    ];
    const fakeExecutionMetrics = { totalExecutions: 10, autonomousExecutions: 7, pendingApprovals: 1 };
    const fakeConvMetrics = { count: 25 };

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // artifact fetch
            return { from: () => ({ where: () => ({ limit: () => [fakeArtifact] }) }) };
          } else if (callIndex === 2) {
            // bound modules
            return { from: () => ({ innerJoin: () => ({ where: () => fakeBoundModules }) }) };
          } else if (callIndex === 3) {
            // execution metrics
            return { from: () => ({ where: () => [fakeExecutionMetrics] }) };
          } else {
            // conversation metrics
            return { from: () => ({ where: () => [fakeConvMetrics] }) };
          }
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.workspace({ artifactId: ARTIFACT_ID });

    expect(result.artifact).toEqual(fakeArtifact);
    expect(result.boundModules).toEqual(fakeBoundModules);
    expect(result.metrics.automationScore).toBe(70); // 7/10 * 100
    expect(result.metrics.conversationCount).toBe(25);
    expect(result.metrics.pendingApprovals).toBe(1);
  });

  it('throws NOT_FOUND when artifact does not exist', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({ where: () => ({ limit: () => [] }) }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(caller.workspace({ artifactId: ARTIFACT_ID })).rejects.toThrow('Artifact not found');
  });
});

// ---------------------------------------------------------------------------
// activityFeed
// ---------------------------------------------------------------------------

describe('agent.activityFeed', () => {
  it('returns recent module executions', async () => {
    const fakeRows = [
      { id: 'e1', moduleSlug: 'qualify_lead', status: 'executed', createdAt: '2026-01-01' },
      { id: 'e2', moduleSlug: 'book_meeting', status: 'pending', createdAt: '2026-01-02' },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => fakeRows,
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.activityFeed({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0].moduleSlug).toBe('qualify_lead');
  });
});

// ---------------------------------------------------------------------------
// salesPipeline
// ---------------------------------------------------------------------------

describe('agent.salesPipeline', () => {
  it('returns leads grouped by stage', async () => {
    const fakeRows = [
      { stage: 'new', count: 5, totalValue: '1000.00' },
      { stage: 'qualifying', count: 3, totalValue: '5000.00' },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                groupBy: () => fakeRows,
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesPipeline({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0].stage).toBe('new');
    expect(result[0].count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// salesLeads
// ---------------------------------------------------------------------------

describe('agent.salesLeads', () => {
  it('returns lead list with customer info', async () => {
    const fakeRows = [
      { id: 'l1', score: 'hot', stage: 'proposal', customerName: 'Alice', customerEmail: 'a@e.com' },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: (..._a: Any[]) => ({
              innerJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => fakeRows,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.salesLeads({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(1);
    expect(result[0].customerName).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// updateLeadStage
// ---------------------------------------------------------------------------

describe('agent.updateLeadStage', () => {
  it('updates lead stage and returns result', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => [{ id: 'lead-1', stage: 'closed_won' }],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.updateLeadStage({
      leadId: '00000000-0000-0000-0000-000000000010',
      stage: 'closed_won',
    });

    expect(result.stage).toBe('closed_won');
  });

  it('throws NOT_FOUND when lead does not exist', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => [],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.updateLeadStage({
        leadId: '00000000-0000-0000-0000-000000000010',
        stage: 'proposal',
      }),
    ).rejects.toThrow('Lead not found');
  });
});

// ---------------------------------------------------------------------------
// supportTickets
// ---------------------------------------------------------------------------

describe('agent.supportTickets', () => {
  it('returns ticket executions (SQL-level JSONB filtering)', async () => {
    // Filtering happens in SQL WHERE (output->>'status', output->>'priority'),
    // so mock returns pre-filtered results as if DB applied the predicate.
    const fakeRows = [
      { id: 'e1', output: { ticket_id: 'TKT-1', status: 'open', priority: 'high' }, status: 'executed', conversationId: 'c1', createdAt: '2026-01-01' },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => fakeRows,
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.supportTickets({ artifactId: ARTIFACT_ID, status: 'open' });
    expect(result).toHaveLength(1);
    expect((result[0].output as Any).ticket_id).toBe('TKT-1');
  });

  it('accepts all ticket statuses including waiting', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => [],
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    // 'waiting' should be accepted without Zod validation error
    const result = await caller.supportTickets({ artifactId: ARTIFACT_ID, status: 'waiting' });
    expect(result).toHaveLength(0);
  });

  it('pagination returns deterministic page size with SQL-level filters', async () => {
    // Simulate a page of 2 results from a filtered query (all matching the SQL WHERE)
    const page = [
      { id: 'e1', output: { ticket_id: 'TKT-1', status: 'open', priority: 'high' }, status: 'executed', conversationId: 'c1', createdAt: '2026-01-01' },
      { id: 'e3', output: { ticket_id: 'TKT-3', status: 'open', priority: 'medium' }, status: 'executed', conversationId: 'c3', createdAt: '2026-01-03' },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => page,
                }),
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.supportTickets({
      artifactId: ARTIFACT_ID,
      status: 'open',
      limit: 2,
      offset: 0,
    });

    // Because filtering is SQL-side, the page size matches the LIMIT exactly
    expect(result).toHaveLength(2);
    expect((result[0].output as Any).status).toBe('open');
    expect((result[1].output as Any).status).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// updateTicketStatus
// ---------------------------------------------------------------------------

describe('agent.updateTicketStatus', () => {
  it('updates ticket output JSONB status field', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => [{ id: 'e1', output: { ticket_id: 'TKT-1', status: 'closed' } }],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.updateTicketStatus({
      executionId: '00000000-0000-0000-0000-000000000010',
      status: 'closed',
    });

    expect((result.output as Any).status).toBe('closed');
  });
});

// ---------------------------------------------------------------------------
// acknowledgeEscalation
// ---------------------------------------------------------------------------

describe('agent.acknowledgeEscalation', () => {
  it('moves escalated conversation to active', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => [{ id: CONVERSATION_ID, status: 'active' }],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.acknowledgeEscalation({ conversationId: CONVERSATION_ID });

    expect(result.status).toBe('active');
  });

  it('throws NOT_FOUND when no escalated conversation', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        update: () => ({
          set: () => ({
            where: () => ({
              returning: () => [],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.acknowledgeEscalation({ conversationId: CONVERSATION_ID }),
    ).rejects.toThrow('Escalated conversation not found');
  });
});

// ---------------------------------------------------------------------------
// initiateHandoff
// ---------------------------------------------------------------------------

describe('agent.initiateHandoff', () => {
  it('completes handoff and returns target artifact info', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      callIndex = 0; // Reset per transaction call
      const mockTx = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // conversation fetch
            return { from: () => ({ where: () => ({ limit: () => [{ id: CONVERSATION_ID, artifactId: ARTIFACT_ID }] }) }) };
          } else if (callIndex === 2) {
            // target artifact fetch
            return { from: () => ({ where: () => ({ limit: () => [{ id: TARGET_ARTIFACT_ID, name: 'Support Bot', type: 'support' }] }) }) };
          } else if (callIndex === 3) {
            // hop count
            return { from: () => ({ where: () => [{ count: 1 }] }) };
          } else if (callIndex === 4) {
            // recent handoff cooldown check — none
            return { from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) };
          } else {
            // circular detection — none
            return { from: () => ({ where: () => ({ limit: () => [] }) }) };
          }
        },
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return fn(mockTx);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.initiateHandoff({
      conversationId: CONVERSATION_ID,
      targetArtifactId: TARGET_ARTIFACT_ID,
      reason: 'Customer needs sales help',
    });

    expect(result.targetArtifact.id).toBe(TARGET_ARTIFACT_ID);
    expect(result.targetArtifact.name).toBe('Support Bot');
    expect(result.handoffReason).toBe('Customer needs sales help');
  });

  it('allows first handoff when only non-handoff assignments exist', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      callIndex = 0;
      const mockTx = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // conversation with current artifact
            return { from: () => ({ where: () => ({ limit: () => [{ id: CONVERSATION_ID, artifactId: ARTIFACT_ID }] }) }) };
          } else if (callIndex === 2) {
            // target artifact exists
            return { from: () => ({ where: () => ({ limit: () => [{ id: TARGET_ARTIFACT_ID, name: 'Support Bot', type: 'support' }] }) }) };
          } else if (callIndex === 3) {
            // hop count = 1 (only the initial route_rule assignment)
            return { from: () => ({ where: () => [{ count: 1 }] }) };
          } else if (callIndex === 4) {
            // recent handoff cooldown — returns a recent non-handoff assignment (should be ignored by scoped query)
            return { from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) };
          } else {
            // circular detection — none
            return { from: () => ({ where: () => ({ limit: () => [] }) }) };
          }
        },
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return fn(mockTx);
    });

    const caller = createCaller(makeCtx(db));
    // Should succeed — the cooldown guard only looks at handoff assignments, not route_rule ones
    const result = await caller.initiateHandoff({
      conversationId: CONVERSATION_ID,
      targetArtifactId: TARGET_ARTIFACT_ID,
      reason: 'First handoff after initial routing',
    });

    expect(result.targetArtifact.id).toBe(TARGET_ARTIFACT_ID);
  });

  it('rejects same-artifact handoff', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockTx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [{ id: CONVERSATION_ID, artifactId: ARTIFACT_ID }],
            }),
          }),
        }),
      };
      return fn(mockTx);
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.initiateHandoff({
        conversationId: CONVERSATION_ID,
        targetArtifactId: ARTIFACT_ID, // same as source
        reason: 'Test',
      }),
    ).rejects.toThrow('Cannot handoff to the same artifact');
  });

  it('rejects when max handoff hops reached', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      callIndex = 0;
      const mockTx = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return { from: () => ({ where: () => ({ limit: () => [{ id: CONVERSATION_ID, artifactId: ARTIFACT_ID }] }) }) };
          } else if (callIndex === 2) {
            return { from: () => ({ where: () => ({ limit: () => [{ id: TARGET_ARTIFACT_ID, name: 'Bot', type: 'support' }] }) }) };
          } else {
            // hop count = 3 (max reached)
            return { from: () => ({ where: () => [{ count: 3 }] }) };
          }
        },
      };
      return fn(mockTx);
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.initiateHandoff({
        conversationId: CONVERSATION_ID,
        targetArtifactId: TARGET_ARTIFACT_ID,
        reason: 'Test',
      }),
    ).rejects.toThrow('Maximum handoff limit (3) reached');
  });
});

// ---------------------------------------------------------------------------
// handoffHistory
// ---------------------------------------------------------------------------

describe('agent.handoffHistory', () => {
  it('returns ordered assignment history', async () => {
    const fakeRows = [
      { id: 'a1', artifactId: ARTIFACT_ID, artifactName: 'Sales', assignmentReason: 'route_rule', isActive: false, startedAt: '2026-01-01' },
      { id: 'a2', artifactId: TARGET_ARTIFACT_ID, artifactName: 'Support', assignmentReason: 'handoff', isActive: true, startedAt: '2026-01-02' },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                orderBy: () => fakeRows,
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.handoffHistory({ conversationId: CONVERSATION_ID });

    expect(result).toHaveLength(2);
    expect(result[0].assignmentReason).toBe('route_rule');
    expect(result[1].assignmentReason).toBe('handoff');
  });
});

// ---------------------------------------------------------------------------
// highPriorityIntents
// ---------------------------------------------------------------------------

describe('agent.highPriorityIntents', () => {
  it('returns priority intent counts from interaction logs', async () => {
    const fakeIntentRows = [
      { intent: 'complaint', count: 5, latestConversationId: 'c1', lastSeen: '2026-01-15' },
      { intent: 'escalation_request', count: 2, latestConversationId: 'c2', lastSeen: '2026-01-14' },
    ];

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // tenant settings
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ settings: { priorityIntents: ['complaint', 'escalation_request', 'negotiation'] } }],
                }),
              }),
            };
          } else {
            // interaction logs grouped
            return {
              from: () => ({
                where: () => ({
                  groupBy: () => ({
                    orderBy: () => fakeIntentRows,
                  }),
                }),
              }),
            };
          }
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.highPriorityIntents({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0].intent).toBe('complaint');
    expect(result[0].count).toBe(5);
  });

  it('uses default priority intents when tenant has none', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ settings: {} }], // no priorityIntents key
                }),
              }),
            };
          } else {
            return {
              from: () => ({
                where: () => ({
                  groupBy: () => ({
                    orderBy: () => [],
                  }),
                }),
              }),
            };
          }
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.highPriorityIntents({ artifactId: ARTIFACT_ID });
    // Should still query — defaults are ['complaint', 'escalation_request', 'negotiation']
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// updatePriorityIntents
// ---------------------------------------------------------------------------

describe('agent.updatePriorityIntents', () => {
  it('updates tenant settings with new priority intents', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const db = mockTenantDb(async (fn: Any) => {
      return fn({ update: updateSpy });
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.updatePriorityIntents({
      intents: ['complaint', 'negotiation'],
    });

    expect(result.intents).toEqual(['complaint', 'negotiation']);
    expect(updateSpy).toHaveBeenCalled();
  });

  it('rejects invalid intent strings', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      return fn({ update: vi.fn() });
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.updatePriorityIntents({
        intents: ['purchase', 'urgent'], // not in intent enum
      }),
    ).rejects.toThrow(); // Zod validation error
  });
});

// ---------------------------------------------------------------------------
// marketingInterestMap
// ---------------------------------------------------------------------------

describe('agent.marketingInterestMap', () => {
  it('returns topics grouped by interest level', async () => {
    const fakeRows = [
      { topic: 'Product A', interestLevel: 'ready_to_buy', count: 10 },
      { topic: 'Product B', interestLevel: 'considering', count: 5 },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              groupBy: () => ({
                orderBy: () => fakeRows,
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.marketingInterestMap({ artifactId: ARTIFACT_ID });

    expect(result).toHaveLength(2);
    expect(result[0].topic).toBe('Product A');
  });
});
