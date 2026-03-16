import { describe, it, expect } from 'vitest';
import { fetchAdvisorSnapshot } from '../../lib/advisor-snapshot.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Build a TenantDb mock whose single `query(fn)` call provides a mock `db`
 * that returns `results[i]` for the i-th `db.select()` call.
 * All chain methods (from/where/groupBy/orderBy/limit) return the same thenable
 * so any chain length resolves to the correct result.
 */
function makeTenantDb(results: Any[]): TenantDb {
  return {
    query: async (fn: Any) => {
      let callIndex = 0;
      return fn({
        select: () => {
          const idx = callIndex++;
          const result = results[idx] ?? [];
          const chain: Any = {
            from: () => chain,
            where: () => chain,
            groupBy: () => chain,
            orderBy: () => chain,
            limit: () => chain,
            innerJoin: () => chain,
            then: (resolve: Any, reject: Any) =>
              Promise.resolve(result).then(resolve, reject),
          };
          return chain;
        },
      });
    },
  } as Any;
}

/**
 * Default 8-element results array for fetchAdvisorSnapshot:
 *   [0] activeConvRows   [1] priorConvRows
 *   [2] pendingByCurrencyRows (grouped by currency)   [3] paidPayRows
 *   [4] leadRows         [5] gapRows
 *   [6] approvalRows     [7] execRows
 */
function makeResults(overrides: Record<number, Any[]> = {}): Any[] {
  const defaults: Any[] = [
    [{ count: 5 }],                                              // 0 activeConvRows
    [{ count: 3 }],                                              // 1 priorConvRows
    [{ currency: 'USD', count: 2, totalAmount: '300.00' }],      // 2 pendingByCurrencyRows
    [{ count: 1, totalAmount: '120.00' }],                       // 3 paidPayRows
    [{ stage: 'new', count: 4 }, { stage: 'qualifying', count: 2 }], // 4 leadRows
    // gapRows: implementation reads row.metadata.intentType and counts in JS
    Array.from({ length: 5 }, () => ({ metadata: { intentType: 'pricing', sampleQuestion: 'How much does it cost?' } })).concat(
      Array.from({ length: 3 }, () => ({ metadata: { intentType: 'shipping', sampleQuestion: 'How long does shipping take?' } })),
    ),                                                                             // 5 gapRows
    [{ count: 1 }],                                              // 6 approvalRows
    [{ slug: 'book_meeting', count: 3 }],                        // 7 execRows
  ];
  for (const [k, v] of Object.entries(overrides)) {
    defaults[Number(k)] = v;
  }
  return defaults;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchAdvisorSnapshot', () => {
  it('1a — correct counts for fixture data', async () => {
    const db = makeTenantDb(makeResults());
    const snap = await fetchAdvisorSnapshot(db, TENANT_ID);

    expect(snap.activeConversations).toBe(5);
    // trend: (5-3)/3 * 100 = 66.67 → rounded to 67
    expect(snap.conversationTrend).toBe(67);
    expect(snap.pendingPayments.count).toBe(2);
    expect(snap.pendingPayments.byCurrency).toEqual([{ currency: 'USD', totalAmount: 300 }]);
    expect(snap.paidPayments.count).toBe(1);
    expect(snap.paidPayments.totalAmount).toBe(120);
    expect(snap.leadsByStage['new']).toBe(4);
    expect(snap.leadsByStage['qualifying']).toBe(2);
    expect(snap.topKnowledgeGaps[0]).toEqual({ intentType: 'pricing', sampleQuestion: 'How much does it cost?' });
    expect(snap.topKnowledgeGaps[1]).toEqual({ intentType: 'shipping', sampleQuestion: 'How long does shipping take?' });
    expect(snap.pendingApprovals).toBe(1);
    expect(snap.recentExecutions[0]).toEqual({ slug: 'book_meeting', count: 3 });
  });

  it('1b — zeros when no data', async () => {
    const db = makeTenantDb(makeResults({
      0: [{ count: 0 }],
      1: [{ count: 0 }],
      2: [],                               // no pending payments in any currency
      3: [{ count: 0, totalAmount: null }],
      4: [],
      5: [],
      6: [{ count: 0 }],
      7: [],
    }));
    const snap = await fetchAdvisorSnapshot(db, TENANT_ID);

    expect(snap.activeConversations).toBe(0);
    expect(snap.conversationTrend).toBe(0);
    expect(snap.pendingPayments.count).toBe(0);
    expect(snap.pendingPayments.byCurrency).toEqual([]);
    expect(snap.leadsByStage).toEqual({});
    expect(snap.topKnowledgeGaps).toEqual([]);
    expect(snap.pendingApprovals).toBe(0);
    expect(snap.recentExecutions).toEqual([]);
  });

  it('1c — trend is 100 when prior count is 0 but current is positive', async () => {
    const db = makeTenantDb(makeResults({
      0: [{ count: 3 }],
      1: [{ count: 0 }],
    }));
    const snap = await fetchAdvisorSnapshot(db, TENANT_ID);

    expect(snap.conversationTrend).toBe(100);
  });

  it('1d — trend is 0 when both counts are 0', async () => {
    const db = makeTenantDb(makeResults({
      0: [{ count: 0 }],
      1: [{ count: 0 }],
    }));
    const snap = await fetchAdvisorSnapshot(db, TENANT_ID);

    expect(snap.conversationTrend).toBe(0);
  });
});
