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
// agent.salesMeetings
// ---------------------------------------------------------------------------

describe('agent.salesMeetings', () => {
  it('happy path — returns customerName, datetime, topic, booked=true for a booked meeting', async () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000060',
        output: { booked: true, datetime: '2025-06-15T10:00:00.000Z', calendar_link: 'https://cal.test/abc' },
        status: 'executed',
        conversationId: CONV_ID_1,
        createdAt: new Date('2025-06-01'),
        leadId: LEAD_ID_1,
        customerId: '00000000-0000-0000-0000-000000000040',
        customerName: 'Acme Corp',
        datetime: '2025-06-15T10:00:00.000Z',
        topic: 'Product demo',
        booked: true,
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
    const result = await caller.salesMeetings({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result[0].customerName).toBe('Acme Corp');
    expect(result[0].datetime).toBe('2025-06-15T10:00:00.000Z');
    expect(result[0].topic).toBe('Product demo');
    expect(result[0].booked).toBe(true);
  });

  it('null customer — LEFT JOIN miss yields null customerName/datetime/topic without crash', async () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000061',
        output: { booked: false },
        status: 'executed',
        conversationId: CONV_ID_2,
        createdAt: new Date('2025-06-02'),
        leadId: null,
        customerId: null,
        customerName: null,
        datetime: null,
        topic: null,
        booked: false,
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
    const result = await caller.salesMeetings({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result[0].customerName).toBeNull();
    expect(result[0].datetime).toBeNull();
    expect(result[0].topic).toBeNull();
  });

  it('empty result — returns [] when no book_meeting executions exist', async () => {
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
    const result = await caller.salesMeetings({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result.length).toBe(0);
  });
});
