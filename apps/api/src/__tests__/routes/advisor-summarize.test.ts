import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryFn: vi.fn(),
  generateText: vi.fn(),
  generateEmbedding: vi.fn(),
  createLLMClient: vi.fn(),
}));

// Spies on drizzle-orm query functions so Test 3c can directly verify
// the predicate arguments passed to the messages WHERE clause.
// vi.clearAllMocks() clears call history only (not implementations), so these
// persist correctly across tests.
const drizzleSpies = vi.hoisted(() => ({
  inArray: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@camello/db', async () => {
  const schema = await vi.importActual<typeof import('@camello/db/schema')>('@camello/db/schema');
  return { ...schema, db: {}, pool: {}, createTenantDb: vi.fn() };
});

vi.mock('@camello/ai', () => ({
  generateEmbedding: mocks.generateEmbedding,
  createLLMClient: mocks.createLLMClient,
}));

vi.mock('ai', () => ({ generateText: mocks.generateText }));

// Partially mock drizzle-orm: spread all real exports (preserving sql tag, column
// builders, etc. so schema building inside @camello/db importActual is unaffected),
// then replace query-predicate functions with call-recording spies.
// The mock DB chain (below) accepts any value passed to where()/orderBy(), so the
// spies do NOT need call-through implementations — recording args is sufficient.
vi.mock('drizzle-orm', async (importActual) => {
  const actual = await importActual<typeof import('drizzle-orm')>();
  return {
    ...actual,
    inArray: drizzleSpies.inArray,
    eq: drizzleSpies.eq,
    and: drizzleSpies.and,
    desc: drizzleSpies.desc,
  };
});

import { createCallerFactory } from '../../trpc/init.js';
import { advisorRouter } from '../../routes/advisor.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CONV_ID   = '00000000-0000-0000-0000-000000000020';
const USER_ID   = 'user_test_123';

const createCaller = createCallerFactory(advisorRouter);

function mockTenantDb(): TenantDb {
  return { query: mocks.queryFn, transaction: vi.fn() } as Any;
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

const FIXTURE_MESSAGES = [
  { role: 'customer', content: 'We sell handmade furniture.' },
  { role: 'artifact', content: 'Got it! How many products?' },
  { role: 'customer', content: 'About 50 products.' },
  { role: 'artifact', content: 'Nice! Any seasonal variations?' },
  { role: 'customer', content: 'Yes, holiday season is our peak.' },
];

// ── Helpers for the 3 sequential tenantDb.query() calls in summarizeSession ──
// 1. Conversation + artifact verification (JOIN conversations → artifacts)
// 2. Messages fetch (WHERE clause args verified in Test 3c via drizzleSpies)
// 3. knowledgeDocs insert

function mockVerifyAdvisor(): void {
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: () => [{ artifactType: 'advisor' }] }),
          }),
        }),
      }),
    }),
  );
}

function mockMessagesFetch(rows: Any[] = FIXTURE_MESSAGES): void {
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit: () => rows }) }),
        }),
      }),
    }),
  );
}

function mockInsert(onValues?: (vals: Any) => void): void {
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({
      insert: () => ({
        values: (vals: Any) => {
          onValues?.(vals);
          return {};
        },
      }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateText.mockResolvedValue({ text: '• Sells handmade furniture\n• ~50 products\n• Peak in holiday season' });
  mocks.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  mocks.createLLMClient.mockReturnValue((_model: string) => ({ modelId: _model }));
});

describe('advisorRouter.summarizeSession', () => {
  it('3a — inserts knowledge_doc with sourceType "advisor"', async () => {
    let insertValues: Any = null;
    mockVerifyAdvisor();
    mockMessagesFetch();
    mockInsert((vals) => { insertValues = vals; });

    const caller = createCaller(makeCtx(mockTenantDb()));
    const result = await caller.summarizeSession({ conversationId: CONV_ID });

    expect(result.ok).toBe(true);
    expect(insertValues).toBeTruthy();
    expect(insertValues.sourceType).toBe('advisor');
    expect(insertValues.tenantId).toBe(TENANT_ID);
    expect(insertValues.content).toContain('furniture');
  });

  it('3b — formats dialogue with correct Owner/Advisor prefixes from DB role values', async () => {
    mockVerifyAdvisor();
    mockMessagesFetch();
    mockInsert();

    const caller = createCaller(makeCtx(mockTenantDb()));
    await caller.summarizeSession({ conversationId: CONV_ID });

    expect(mocks.generateText).toHaveBeenCalledOnce();
    const promptArg: string = mocks.generateText.mock.calls[0][0].prompt;

    // DB role 'customer' maps to 'Owner'; DB role 'artifact' maps to 'Advisor'
    expect(promptArg).toContain('Owner:');
    expect(promptArg).toContain('Advisor:');
    // Must NOT use frontend ChatMessage role values (test-chat-panel.tsx display only)
    expect(promptArg).not.toContain('user:');
    expect(promptArg).not.toContain('assistant:');
  });

  it('3c — messages query uses tenantId, conversationId, and role filter ["customer","artifact"]', async () => {
    mockVerifyAdvisor();
    mockMessagesFetch([]);
    mockInsert();

    const caller = createCaller(makeCtx(mockTenantDb()));
    await caller.summarizeSession({ conversationId: CONV_ID });

    // ── inArray check ──────────────────────────────────────────────────────────
    // inArray is called ONLY in the messages WHERE clause — the conversation
    // verification query (query 1) uses only eq/and. So this assertion directly
    // and exclusively verifies the role filter in the messages query.
    // If the production code removes or changes inArray(..., ['customer','artifact']),
    // this expectation fails.
    expect(drizzleSpies.inArray).toHaveBeenCalledWith(
      expect.anything(),        // messages.role column object
      ['customer', 'artifact'], // only these DB role values — 'human'/'system' excluded
    );

    // ── eq checks ─────────────────────────────────────────────────────────────
    // Drizzle PgColumn objects expose their SQL column name via .name.
    //
    // messages.conversationId → col.name === 'conversation_id'
    //   This is distinct from the verification query's eq(conversations.id, ...)
    //   where col.name === 'id'. So checking col.name === 'conversation_id'
    //   isolates the messages-query predicate.
    //
    // messages.tenantId → col.name === 'tenant_id'
    //   Both queries use tenant_id; at minimum one call with TENANT_ID confirms
    //   the guard is present somewhere in the pipeline.
    const eqCalls = drizzleSpies.eq.mock.calls as [Any, Any][];

    const hasConversationIdFilter = eqCalls.some(
      ([col, val]) => col?.name === 'conversation_id' && val === CONV_ID,
    );
    expect(hasConversationIdFilter).toBe(true);

    const hasTenantIdFilter = eqCalls.some(
      ([col, val]) => col?.name === 'tenant_id' && val === TENANT_ID,
    );
    expect(hasTenantIdFilter).toBe(true);
  });

  it('3d — throws NOT_FOUND when no advisor conversation found', async () => {
    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn({
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({ limit: () => [] }),
            }),
          }),
        }),
      }),
    );

    const caller = createCaller(makeCtx(mockTenantDb()));

    await expect(
      caller.summarizeSession({ conversationId: CONV_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Subsequent DB queries (messages fetch, insert) must NOT have been called
    expect(mocks.queryFn).toHaveBeenCalledTimes(1);
  });

  it('3e — throws NOT_FOUND when conversation belongs to non-advisor artifact', async () => {
    mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
      fn({
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({ limit: () => [{ artifactType: 'sales' }] }),
            }),
          }),
        }),
      }),
    );

    const caller = createCaller(makeCtx(mockTenantDb()));

    await expect(
      caller.summarizeSession({ conversationId: CONV_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(mocks.queryFn).toHaveBeenCalledTimes(1);
  });
});
