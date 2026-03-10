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
// agent.salesQuotes
// ---------------------------------------------------------------------------

describe('agent.salesQuotes', () => {
  it('happy path — returns enriched rows with customerName, amount, quoteStatus', async () => {
    const rows = [
      {
        id: '00000000-0000-0000-0000-000000000050',
        output: { total: '1500.00', status: 'sent' },
        status: 'executed',
        conversationId: CONV_ID_1,
        createdAt: new Date('2025-01-01'),
        leadId: LEAD_ID_1,
        customerId: '00000000-0000-0000-0000-000000000040',
        customerName: 'Acme Corp',
        amount: '1500.00',
        quoteStatus: 'sent',
      },
      {
        id: '00000000-0000-0000-0000-000000000051',
        output: { total: '2000.00', status: 'viewed' },
        status: 'executed',
        conversationId: CONV_ID_2,
        createdAt: new Date('2025-01-02'),
        leadId: '00000000-0000-0000-0000-000000000031',
        customerId: '00000000-0000-0000-0000-000000000041',
        customerName: 'Beta Ltd',
        amount: '2000.00',
        quoteStatus: 'viewed',
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
    const result = await caller.salesQuotes({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result[0].customerName).toBe('Acme Corp');
    expect(result[0].amount).toBe('1500.00');
    expect(result[0].quoteStatus).toBe('sent');
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
        amount: null,
        quoteStatus: null,
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
    const result = await caller.salesQuotes({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result[0].customerName).toBeNull();
    expect(result[0].amount).toBeNull();
    expect(result[0].quoteStatus).toBeNull();
  });

  it('empty result — returns [] when no send_quote executions exist', async () => {
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
    const result = await caller.salesQuotes({ artifactId: ARTIFACT_ID, limit: 50, offset: 0 });

    expect(result.length).toBe(0);
  });
});
