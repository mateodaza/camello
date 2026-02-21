import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  queryFn: vi.fn(),
  transactionFn: vi.fn(),
  classifyIntent: vi.fn(),
  selectModel: vi.fn(),
  buildSystemPrompt: vi.fn(),
  createLLMClient: vi.fn(),
  createArtifactResolver: vi.fn(),
  searchKnowledge: vi.fn(),
  generateEmbedding: vi.fn(),
  buildToolsFromBindings: vi.fn(),
  generateText: vi.fn(),
  createTrace: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@camello/db', async () => {
  const schema = await vi.importActual<typeof import('@camello/db/schema')>('@camello/db/schema');
  return { ...schema, db: {}, pool: {}, createTenantDb: vi.fn() };
});

vi.mock('@camello/ai', () => ({
  classifyIntent: mocks.classifyIntent,
  selectModel: mocks.selectModel,
  buildSystemPrompt: mocks.buildSystemPrompt,
  createLLMClient: mocks.createLLMClient,
  createArtifactResolver: mocks.createArtifactResolver,
  searchKnowledge: mocks.searchKnowledge,
  generateEmbedding: mocks.generateEmbedding,
  buildToolsFromBindings: mocks.buildToolsFromBindings,
}));

vi.mock('ai', () => ({ generateText: mocks.generateText }));

vi.mock('../../lib/langfuse.js', () => ({
  createTrace: mocks.createTrace,
  buildTelemetry: () => undefined,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@camello/shared/constants', () => ({
  COST_BUDGET_DEFAULTS: { starter: 5, growth: 25, scale: 100 } as Record<string, number>,
  LEARNING_CONFIDENCE: { retrieval_floor: 0.5 },
}));

import { handleMessage, BUDGET_EXCEEDED_RESPONSE } from '../../orchestration/message-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000004';

function makeTenantDb() {
  return { query: mocks.queryFn, transaction: mocks.transactionFn } as Any;
}

function makeInput(overrides?: Partial<Parameters<typeof handleMessage>[0]>) {
  return {
    tenantDb: makeTenantDb(),
    tenantId: TENANT_ID,
    channel: 'webchat' as const,
    customerId: CUSTOMER_ID,
    messageText: 'Hello',
    ...overrides,
  };
}

function makeTraceContext() {
  return {
    traceId: 'trace_test_123',
    metadata: {},
    setMetadata: vi.fn(),
    span: vi.fn(async (_name: string, fn: () => Promise<Any>) => fn()),
    finalize: vi.fn(),
  };
}

/**
 * Set up the first 2 queries (tenant info + budget check) that always run,
 * then mock the budget-exceeded path's DB sequence when budget IS exceeded.
 */
function setupBudgetExceededFlow(opts: {
  planTier?: string;
  monthlyCostBudgetUsd?: string | null;
  currentMonthCost: string;
}) {
  const trace = makeTraceContext();
  mocks.createTrace.mockReturnValue(trace);

  // #1 query — Step 0: Fetch tenant info
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{
              name: 'Acme Corp',
              planTier: opts.planTier ?? 'starter',
              monthlyCostBudgetUsd: opts.monthlyCostBudgetUsd ?? null,
              defaultArtifactId: ARTIFACT_ID,
            }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #2 query — Step 1: Budget check
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => [{ totalCost: opts.currentMonthCost }],
        }),
      }),
    };
    return fn(mockDb);
  });

  return { trace };
}

/**
 * Mock the handleBudgetExceeded DB sequence (after the budget gate triggers).
 * No existingConversationId → skips ownership check.
 */
function setupBudgetExceededDbWrites() {
  // #3 query — Verify default artifact is active
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ id: ARTIFACT_ID }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #4 transaction — Create conversation + assignment
  mocks.transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = {
      insert: () => ({
        values: () => ({
          returning: () => [{ id: CONVERSATION_ID }],
        }),
      }),
    };
    return fn(mockTx);
  });

  // #5 query — Save customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #6 query — Save canned response
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #7 query — Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #8 query — Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });
}

/**
 * Set up the full happy-path pipeline (budget not exceeded).
 * Reuses the same query sequence as full-message-pipeline.test.ts.
 */
function setupUnderBudgetFlow(opts: {
  planTier?: string;
  monthlyCostBudgetUsd?: string | null;
  currentMonthCost: string;
}) {
  const { trace } = setupBudgetExceededFlow(opts);

  // Pipeline proceeds — mock remaining @camello/ai functions
  mocks.classifyIntent.mockResolvedValue({
    type: 'greeting', confidence: 0.85, complexity: 'simple',
    requires_knowledge_base: false, sentiment: 'neutral', source: 'regex',
  });
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID, artifactName: 'Support Bot',
      artifactType: 'customer_support', source: 'tenant_default_fallback',
      isNewConversation: true,
    }),
  });
  mocks.selectModel.mockReturnValue({ tier: 'fast', model: 'google/gemini-2.0-flash-001' });
  mocks.buildSystemPrompt.mockReturnValue('You are Support Bot...');
  mocks.createLLMClient.mockReturnValue((m: string) => ({ modelId: m }));
  mocks.searchKnowledge.mockResolvedValue({
    directContext: [], proactiveContext: [],
    totalTokensUsed: 0, docsRetrieved: 0, searchSkipped: true,
  });
  mocks.generateText.mockResolvedValue({
    text: 'Hi there!', usage: { promptTokens: 80, completionTokens: 15 }, steps: [],
  });
  mocks.createClient.mockReturnValue({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  });

  // #3 transaction — Create conversation
  mocks.transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = {
      insert: () => ({ values: () => ({ returning: () => [{ id: CONVERSATION_ID }] }) }),
    };
    return fn(mockTx);
  });

  // #4 query — Insert customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({ returning: () => [{ id: 'msg_1' }] }) }) };
    return fn(mockDb);
  });

  // #5 query — Load artifact config
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({
        limit: () => [{ id: ARTIFACT_ID, name: 'Support Bot', type: 'customer_support',
          personality: {}, constraints: {}, config: {} }],
      }) }) }),
    };
    return fn(mockDb);
  });

  // #6 query — Fetch module bindings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }) };
    return fn(mockDb);
  });

  // #7 query — Fetch learnings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }),
    };
    return fn(mockDb);
  });

  // #8 query — Fetch conversation history
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [
        { role: 'customer', content: 'Hello' },
      ] }) }) }) }),
    };
    return fn(mockDb);
  });

  // #9 query — Save response
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #10 query — Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #11 query — Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });

  return { trace };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleMessage — budget gate integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test_key');
  });

  it('blocks pipeline at budget gate — no AI calls', async () => {
    setupBudgetExceededFlow({ currentMonthCost: '5.00' }); // = starter budget
    setupBudgetExceededDbWrites();

    const result = await handleMessage(makeInput());

    expect(result.budgetExceeded).toBe(true);
    expect(result.responseText).toBe(BUDGET_EXCEEDED_RESPONSE);
    expect(result.costUsd).toBe(0);
    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
    expect(result.modelUsed).toBe('budget_exceeded');
    expect(result.moduleExecutions).toEqual([]);

    // No paid AI work happened
    expect(mocks.classifyIntent).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.searchKnowledge).not.toHaveBeenCalled();
    expect(mocks.generateEmbedding).not.toHaveBeenCalled();
    expect(mocks.selectModel).not.toHaveBeenCalled();
    expect(mocks.buildSystemPrompt).not.toHaveBeenCalled();
  });

  it('allows pipeline when cost is under budget', async () => {
    setupUnderBudgetFlow({ currentMonthCost: '4.99' }); // < 5.00 starter

    const result = await handleMessage(makeInput());

    expect(result.budgetExceeded).toBeUndefined();
    expect(result.responseText).toBe('Hi there!');

    // Pipeline ran fully
    expect(mocks.classifyIntent).toHaveBeenCalledOnce();
    expect(mocks.generateText).toHaveBeenCalledOnce();
  });

  it('respects custom tenant budget override', async () => {
    // Custom budget $10 — cost at $7.50 is under custom budget
    setupUnderBudgetFlow({
      monthlyCostBudgetUsd: '10.00',
      currentMonthCost: '7.50',
    });

    const result = await handleMessage(makeInput());

    expect(result.budgetExceeded).toBeUndefined();
    expect(mocks.classifyIntent).toHaveBeenCalledOnce();
    expect(mocks.generateText).toHaveBeenCalledOnce();
  });

  it('applies correct default per plan tier', async () => {
    // Growth tier budget = $25 — cost $24.99 is under
    setupUnderBudgetFlow({ planTier: 'growth', currentMonthCost: '24.99' });

    const underResult = await handleMessage(makeInput());
    expect(underResult.budgetExceeded).toBeUndefined();
    expect(mocks.generateText).toHaveBeenCalledOnce();

    // Reset for second call
    vi.clearAllMocks();

    // Growth tier — cost $25.00 hits the limit
    setupBudgetExceededFlow({ planTier: 'growth', currentMonthCost: '25.00' });
    setupBudgetExceededDbWrites();

    const overResult = await handleMessage(makeInput());
    expect(overResult.budgetExceeded).toBe(true);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('saves canned response + telemetry when exceeded', async () => {
    setupBudgetExceededFlow({ currentMonthCost: '5.00' });
    setupBudgetExceededDbWrites();

    const result = await handleMessage(makeInput());

    expect(result.budgetExceeded).toBe(true);
    expect(result.conversationId).toBe(CONVERSATION_ID);
    expect(result.artifactId).toBe(ARTIFACT_ID);
    expect(result.intent.type).toBe('general_inquiry');

    // DB writes happened:
    // 2 (tenant + budget) + 1 (artifact check) + 4 (msg, response, telemetry, update) = 7 queries
    // + 1 transaction = 8 total DB calls
    expect(mocks.queryFn.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(mocks.transactionFn).toHaveBeenCalledOnce();
  });
});
