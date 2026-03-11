import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryFn: vi.fn(),
}));

// Partially mock drizzle-orm: wrap gte with a vi.fn spy so we can verify
// that the 24h time-window condition is actually passed to the WHERE clause.
// The real implementation is still called, so Drizzle SQL objects are valid.
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return { ...actual, gte: vi.fn(actual.gte) };
});

// Real schema objects required so db.insert(ownerNotifications) has a valid
// Drizzle table reference inside the mock DB chain.
vi.mock('@camello/db', async () => {
  const schema = await vi.importActual<typeof import('@camello/db/schema')>('@camello/db/schema');
  return { ...schema, db: {}, pool: {}, createTenantDb: vi.fn() };
});

import { recordKnowledgeGap, TRIVIAL_INTENTS } from '../../orchestration/knowledge-gap.js';
import { gte } from 'drizzle-orm';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';

function makeTenantDb() {
  return { query: mocks.queryFn } as Any;
}

// Unified mock db supporting both SELECT and INSERT chains within one tenantDb.query() call.
// select().from().where() → selectResult (array, resolved immediately by await)
// insert().values().onConflictDoNothing().returning() → Promise<returningResult>
function makeDb(
  selectResult: Any[],
  onInsertValues?: (vals: Any) => void,
  onConflictCalled?: () => void,
  returningResult: Any[] = [],   // default [] (conflict fired); pass [{id: 'uuid'}] for success
) {
  return {
    select: (_fields?: Any) => ({
      from: (_table: Any) => ({
        where: (_condition: Any) => selectResult,
      }),
    }),
    insert: (_table: Any) => ({
      values: (vals: Any) => {
        onInsertValues?.(vals);
        return {
          onConflictDoNothing: () => {
            onConflictCalled?.();
            return {
              returning: (_fields?: Any) => Promise.resolve(returningResult),
            };
          },
        };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordKnowledgeGap', () => {
  it('NC-236-1: records gap when no existing notification in last 24h', async () => {
    let capturedValues: Any;
    let conflictCalled = false;

    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn(makeDb(
        [],                                          // SELECT returns empty — no existing gap
        (vals) => { capturedValues = vals; },        // capture INSERT values
        () => { conflictCalled = true; },            // track onConflictDoNothing call
        [{ id: 'uuid-1' }],                         // returning: insert committed
      ))
    );

    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', 'What is your price?');

    expect(mocks.queryFn).toHaveBeenCalledTimes(1); // one tenantDb.query() call
    expect(conflictCalled).toBe(true);              // INSERT with onConflictDoNothing() was called
    expect(capturedValues.type).toBe('knowledge_gap');
    expect(capturedValues.tenantId).toBe(TENANT_ID);
    expect(capturedValues.artifactId).toBe(ARTIFACT_ID);
    expect(capturedValues.metadata.intentType).toBe('product_inquiry');
    expect(capturedValues.body).toContain('What is your price?');
    expect(capturedValues.body).toContain('product_inquiry');
    expect(result).toBe(true);
  });

  it('NC-236-2: skipped for greeting intent', async () => {
    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'greeting', 'Hi there');
    expect(mocks.queryFn).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('NC-236-3: skipped for farewell intent', async () => {
    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'farewell', 'Goodbye');
    expect(mocks.queryFn).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('NC-236-4: skips insert when gap already recorded within 24h, and verifies 24h time window used in WHERE clause', async () => {
    // Fix Date.now() so we can assert the exact windowStart passed to gte().
    vi.useFakeTimers();
    const fixedNow = new Date('2026-03-11T12:00:00.000Z');
    vi.setSystemTime(fixedNow);

    try {
      let insertCalled = false;

      mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
        fn(makeDb(
          // SELECT returns an existing knowledge_gap row for the same intentType,
          // simulating a notification already recorded within the last 24h.
          [{ metadata: { intentType: 'product_inquiry', sampleQuestion: 'Previous question?' } }],
          () => { insertCalled = true; },  // spy: track if INSERT is attempted
        ))
      );

      const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', 'New question?');

      // The SELECT check ran (tenantDb.query was called once)
      expect(mocks.queryFn).toHaveBeenCalledTimes(1);
      // INSERT was NOT called — deduplicated by the 24h application-layer check
      expect(insertCalled).toBe(false);
      expect(result).toBe(false);

      // Verify gte() was called with the correct 24h rolling window start.
      // If the gte(ownerNotifications.createdAt, windowStart) filter is removed from
      // the WHERE clause, gteMock.mock.calls is empty and the next assertion fails —
      // catching any regression that removes or bypasses the time-window condition.
      const gteMock = gte as Any;
      expect(gteMock.mock.calls.length).toBeGreaterThan(0);
      const dateArg = gteMock.mock.calls[0][1] as Date;
      const expectedWindowStart = new Date(fixedNow.getTime() - 24 * 60 * 60 * 1000);
      expect(dateArg).toBeInstanceOf(Date);
      expect(dateArg.getTime()).toBe(expectedWindowStart.getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it('NC-236-5: truncates customer message to 200 chars', async () => {
    const longMessage = 'A'.repeat(201);
    let capturedValues: Any;

    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn(makeDb([], (vals) => { capturedValues = vals; }, undefined, [{ id: 'uuid-1' }]))
    );

    await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', longMessage);

    expect(capturedValues.body).toContain('A'.repeat(200));
    expect(capturedValues.body).not.toContain('A'.repeat(201));
    expect(capturedValues.metadata.sampleQuestion).toHaveLength(200);
  });

  // NC-237-1: returns true on committed insert
  it('NC-237-1: returns true when insert is committed (returning returns [{id}])', async () => {
    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn(makeDb(
        [],                    // SELECT: no existing gap
        undefined,
        undefined,
        [{ id: 'uuid-1' }],   // returning: insert committed
      ))
    );

    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', 'Test question?');
    expect(result).toBe(true);
  });

  // NC-237-2: returns false on normal dedup (SELECT finds existing row, no INSERT attempted)
  it('NC-237-2: returns false on normal dedup (existing row found in SELECT, no insert)', async () => {
    let insertCalled = false;
    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn(makeDb(
        [{ metadata: { intentType: 'product_inquiry', sampleQuestion: 'Old question' } }],
        () => { insertCalled = true; },
      ))
    );

    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', 'New question?');
    expect(result).toBe(false);
    expect(insertCalled).toBe(false);
  });

  // NC-237-2b: returns false on concurrent dedup (SELECT passes, but returning returns [])
  it('NC-237-2b: returns false on concurrent dedup (returning returns [], conflict silenced insert)', async () => {
    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn(makeDb(
        [],            // SELECT: both concurrent calls passed
        undefined,
        undefined,
        [],            // returning: conflict fired, insert silenced
      ))
    );

    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', 'Concurrent question?');
    expect(result).toBe(false);
  });

  // NC-237-3: returns false and logs warn when DB throws
  it('NC-237-3: returns false and calls console.warn when DB throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.queryFn.mockImplementationOnce(() => Promise.reject(new Error('DB connection error')));

    const result = await recordKnowledgeGap(makeTenantDb(), TENANT_ID, ARTIFACT_ID, 'product_inquiry', 'Question?');
    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('knowledge gap recording failed'),
      expect.stringContaining('DB connection error'),
    );
    warnSpy.mockRestore();
  });
});
