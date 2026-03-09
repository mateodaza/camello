import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { agentRouter } from '../../routes/agent.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID     = 'user_test_123';
const CONV_ID_1   = '00000000-0000-0000-0000-000000000020';
const CONV_ID_2   = '00000000-0000-0000-0000-000000000021';
const LEAD_ID_1   = '00000000-0000-0000-0000-000000000030';

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
// agent.salesFollowups
// ---------------------------------------------------------------------------

describe('agent.salesFollowups', () => {
  it('happy path — returns enriched rows with customerName, followupStatus, scheduledAt', async () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000050',
        output: { followup_status: 'sent', scheduled_at: '2025-06-01T10:00:00.000Z', channel: 'whatsapp' },
        status: 'executed',
        conversationId: CONV_ID_1,
        createdAt: new Date('2025-01-01'),
        leadId: LEAD_ID_1,
        customerId: '00000000-0000-0000-0000-000000000040',
        customerName: 'Acme Corp',
        followupStatus: 'sent',
        scheduledAt: '2025-06-01T10:00:00.000Z',
        channel: 'whatsapp',
        messageTemplate: 'gentle_reminder',
      },
      {
        id: '00000000-0000-0000-0000-000000000051',
        output: { followup_status: 'queued', scheduled_at: '2025-06-02T10:00:00.000Z', channel: 'email' },
        status: 'executed',
        conversationId: CONV_ID_2,
        createdAt: new Date('2025-01-02'),
        leadId: '00000000-0000-0000-0000-000000000031',
        customerId: '00000000-0000-0000-0000-000000000041',
        customerName: 'Beta Ltd',
        followupStatus: 'queued',
        scheduledAt: '2025-06-02T10:00:00.000Z',
        channel: 'email',
        messageTemplate: 'value_add',
      },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => rows,
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
    const result = await caller.salesFollowups({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result[0].customerName).toBe('Acme Corp');
    expect(result[0].followupStatus).toBe('sent');
    expect(result[0].scheduledAt).toBe('2025-06-01T10:00:00.000Z');
    expect(result[1].customerName).toBe('Beta Ltd');
  });

  it('null customer — LEFT JOIN miss yields null fields without crash', async () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000052',
        output: {},
        status: 'executed',
        conversationId: CONV_ID_1,
        createdAt: new Date('2025-01-03'),
        leadId: null,
        customerId: null,
        customerName: null,
        followupStatus: null,
        scheduledAt: null,
        channel: null,
        messageTemplate: null,
      },
    ];

    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => rows,
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
    const result = await caller.salesFollowups({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result[0].customerName).toBeNull();
    expect(result[0].followupStatus).toBeNull();
    expect(result[0].scheduledAt).toBeNull();
  });

  it('empty result — returns [] when no send_followup executions exist', async () => {
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            leftJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  orderBy: () => ({
                    limit: () => ({
                      offset: () => [],
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
    const result = await caller.salesFollowups({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result.length).toBe(0);
  });
});
