import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // tenantDb passed as input — these track calls for assertions
  queryFn: vi.fn(),
  transactionFn: vi.fn(),

  // @camello/ai
  classifyIntent: vi.fn(),
  selectModel: vi.fn(),
  buildSystemPrompt: vi.fn(),
  createLLMClient: vi.fn(),
  createArtifactResolver: vi.fn(),
  searchKnowledge: vi.fn(),
  generateEmbedding: vi.fn(),
  buildToolsFromBindings: vi.fn(),
  shouldCheckGrounding: vi.fn(),
  checkGrounding: vi.fn(),

  // ai SDK
  generateText: vi.fn(),

  // langfuse
  createTrace: vi.fn(),

  // supabase
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
  shouldCheckGrounding: mocks.shouldCheckGrounding,
  checkGrounding: mocks.checkGrounding,
  flattenRagChunks: (chunks: Array<{ content: string }>) => chunks.map((c) => c.content),
  parseMemoryFacts: () => [],
  sanitizeFactValue: (v: string) => v,
  MAX_INJECTED_FACTS: 6,
}));

vi.mock('ai', () => ({
  generateText: mocks.generateText,
}));

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

import { handleMessage } from '../../orchestration/message-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000004';
const MESSAGE_ID = '00000000-0000-0000-0000-000000000005';

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

const GREETING_INTENT = {
  type: 'greeting',
  confidence: 0.85,
  complexity: 'simple' as const,
  requires_knowledge_base: false,
  sentiment: 'neutral' as const,
  source: 'regex' as const,
};

const COMPLEX_INTENT = {
  type: 'product_inquiry',
  confidence: 0.92,
  complexity: 'complex' as const,
  requires_knowledge_base: true,
  sentiment: 'neutral' as const,
  source: 'llm' as const,
};

const DEFAULT_ARTIFACT = {
  id: ARTIFACT_ID,
  name: 'Support Bot',
  type: 'customer_support',
  personality: { tone: 'friendly' },
  constraints: {},
  config: {},
  isActive: true,
  tenantId: TENANT_ID,
};

/** Set up mocks for the "new conversation" happy path (Variant A). */
function setupNewConversationFlow(overrides?: {
  intent?: typeof GREETING_INTENT | typeof COMPLEX_INTENT;
  modules?: Any[];
  learnings?: Any[];
  historyRows?: Any[];
}) {
  const intent = overrides?.intent ?? GREETING_INTENT;
  const trace = makeTraceContext();
  mocks.createTrace.mockReturnValue(trace);

  // -- @camello/ai mocks --
  mocks.classifyIntent.mockResolvedValue(intent);
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID,
      artifactName: 'Support Bot',
      artifactType: 'customer_support',
      source: 'tenant_default_fallback',
      isNewConversation: true,
    }),
  });
  mocks.selectModel.mockReturnValue({ tier: 'fast', model: 'google/gemini-2.0-flash-001' });
  mocks.buildSystemPrompt.mockReturnValue('You are Support Bot...');
  mocks.createLLMClient.mockReturnValue((model: string) => ({ modelId: model }));
  mocks.searchKnowledge.mockResolvedValue({
    directContext: [] as Array<{ content: string; role: string; docType: string | null }>,
    proactiveContext: [] as Array<{ content: string; role: string; docType: string | null }>,
    totalTokensUsed: 0,
    docsRetrieved: 0,
    searchSkipped: true,
  });
  mocks.generateText.mockResolvedValue({
    text: 'Hello! How can I help you today?',
    usage: { promptTokens: 100, completionTokens: 20 },
    steps: [],
  });
  mocks.createClient.mockReturnValue({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  });

  // -- DB query mocks (Variant A: new conversation) --
  // #1 query — Step 0: Fetch tenant info
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{
              name: 'Acme Corp',
              planTier: 'starter',
              monthlyCostBudgetUsd: null,
              defaultArtifactId: ARTIFACT_ID,
            }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #1b query — Step 0b: Fetch customer memory
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ memory: {} }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #2 query — Step 1: Budget check (sum interactionLogs)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => [{ totalCost: '2.50' }],
        }),
      }),
    };
    return fn(mockDb);
  });

  // #3 query — Step 1b: Daily customer ceiling count (under limit)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [{ count: 5 }] }) }) }),
    };
    return fn(mockDb);
  });

  // #4 transaction — Step 4: Create conversation + assignment
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

  // #5 query — Step 4b: Phase B conversation cap check (under limit)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => [{ count: 5 }] }) }),
    };
    return fn(mockDb);
  });

  // #6 query — Step 5: Insert customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      insert: () => ({
        values: () => ({
          returning: () => [{ id: MESSAGE_ID }],
        }),
      }),
    };
    return fn(mockDb);
  });

  // #7 query — Step 6: Load artifact config
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [DEFAULT_ARTIFACT],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #8 query — Step 6b: Fetch module bindings
  const moduleRows = overrides?.modules ?? [];
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => moduleRows,
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #9 query — Step 8: Fetch learnings
  const learningRows = overrides?.learnings ?? [];
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => learningRows,
            }),
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #10 query — Step 11: Fetch conversation history
  const historyRows = overrides?.historyRows ?? [
    { role: 'customer', content: 'Hello' },
  ];
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => historyRows,
            }),
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #11 query — Step 13: Save response message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      insert: () => ({
        values: () => ({}),
      }),
    };
    return fn(mockDb);
  });

  // #12 query — Step 14: Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      insert: () => ({
        values: () => ({}),
      }),
    };
    return fn(mockDb);
  });

  // #13 query — Step 15: Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      update: () => ({
        set: () => ({
          where: () => ({}),
        }),
      }),
    };
    return fn(mockDb);
  });

  return { trace };
}

/** Variant B: reuse existing conversation (no transaction). */
function setupReuseConversationFlow() {
  const trace = makeTraceContext();
  mocks.createTrace.mockReturnValue(trace);

  mocks.classifyIntent.mockResolvedValue(GREETING_INTENT);
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID,
      artifactName: 'Support Bot',
      artifactType: 'customer_support',
      source: 'existing_conversation',
      conversationId: CONVERSATION_ID,
      isNewConversation: false,
    }),
  });
  mocks.selectModel.mockReturnValue({ tier: 'fast', model: 'google/gemini-2.0-flash-001' });
  mocks.buildSystemPrompt.mockReturnValue('You are Support Bot...');
  mocks.createLLMClient.mockReturnValue((model: string) => ({ modelId: model }));
  mocks.searchKnowledge.mockResolvedValue({
    directContext: [] as Array<{ content: string; role: string; docType: string | null }>,
    proactiveContext: [] as Array<{ content: string; role: string; docType: string | null }>,
    totalTokensUsed: 0, docsRetrieved: 0, searchSkipped: true,
  });
  mocks.generateText.mockResolvedValue({
    text: 'Welcome back!',
    usage: { promptTokens: 80, completionTokens: 15 },
    steps: [],
  });
  mocks.createClient.mockReturnValue({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  });

  // #1 query — Step 0: Fetch tenant info
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{
              name: 'Acme Corp', planTier: 'starter',
              monthlyCostBudgetUsd: null, defaultArtifactId: ARTIFACT_ID,
            }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #1b query — Step 0b: Fetch customer memory
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ memory: {} }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #2 query — Step 1: Budget check
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => [{ totalCost: '0' }] }) }),
    };
    return fn(mockDb);
  });

  // #3 query — Step 1b: Daily customer ceiling count (under limit)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [{ count: 5 }] }) }) }),
    };
    return fn(mockDb);
  });

  // No transaction — findOrCreateConversation returns existing ID

  // #4 query — Step 4b: Phase B conversation cap check (under limit)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => [{ count: 5 }] }) }),
    };
    return fn(mockDb);
  });

  // #5 query — Step 5: Insert customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      insert: () => ({ values: () => ({ returning: () => [{ id: MESSAGE_ID }] }) }),
    };
    return fn(mockDb);
  });

  // #6 query — Step 6: Load artifact config
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: () => [DEFAULT_ARTIFACT] }) }) }),
    };
    return fn(mockDb);
  });

  // #7 query — Step 6b: Fetch module bindings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }),
    };
    return fn(mockDb);
  });

  // #8 query — Step 8: Fetch learnings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }),
    };
    return fn(mockDb);
  });

  // #9 query — Step 11: Fetch conversation history (includes current message)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => [
                { role: 'artifact', content: 'Previous reply' },
                { role: 'customer', content: 'Hello' },
              ],
            }),
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #10 query — Step 13: Save response message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #11 query — Step 14: Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #12 query — Step 15: Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });

  return { trace };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleMessage — full pipeline integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test_key');
    mocks.shouldCheckGrounding.mockReturnValue(false);
  });

  it('executes full pipeline for greeting (regex intent, new conversation)', async () => {
    setupNewConversationFlow();

    const result = await handleMessage(makeInput());

    // Pipeline ran to completion
    expect(result.conversationId).toBe(CONVERSATION_ID);
    expect(result.artifactId).toBe(ARTIFACT_ID);
    expect(result.responseText).toBe('Hello! How can I help you today?');
    expect(result.modelUsed).toBe('google/gemini-2.0-flash-001');
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(20);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.moduleExecutions).toEqual([]);
    expect(result.budgetExceeded).toBeUndefined();

    // Verify @camello/ai called
    expect(mocks.classifyIntent).toHaveBeenCalledWith('Hello');
    expect(mocks.selectModel).toHaveBeenCalledWith(GREETING_INTENT);
    expect(mocks.buildSystemPrompt).toHaveBeenCalledOnce();
    expect(mocks.generateText).toHaveBeenCalledOnce();

    // Verify new conversation created via transaction
    expect(mocks.transactionFn).toHaveBeenCalledOnce();

    // Verify DB writes: 13 queries (incl. customer memory) + 1 transaction
    expect(mocks.queryFn).toHaveBeenCalledTimes(13);
  });

  it('routes complex query to balanced model with RAG', async () => {
    const ragContext = [
      { content: 'Our refund policy allows returns within 30 days.', role: 'lead', docType: 'faq' },
    ];
    const proactiveContext = [
      { content: 'We also offer exchanges for free.', role: 'support', docType: 'faq' },
    ];

    mocks.searchKnowledge.mockResolvedValue({
      directContext: ragContext,
      proactiveContext,
      totalTokensUsed: 200,
      docsRetrieved: 2,
      searchSkipped: false,
    });

    setupNewConversationFlow({ intent: COMPLEX_INTENT });

    // Override searchKnowledge again after setup (setup sets it to empty)
    mocks.searchKnowledge.mockResolvedValue({
      directContext: ragContext,
      proactiveContext,
      totalTokensUsed: 200,
      docsRetrieved: 2,
      searchSkipped: false,
    });
    mocks.selectModel.mockReturnValue({ tier: 'balanced', model: 'openai/gpt-4o-mini' });

    const result = await handleMessage(makeInput({ messageText: "What's your refund policy?" }));

    expect(result.modelUsed).toBe('openai/gpt-4o-mini');
    expect(mocks.classifyIntent).toHaveBeenCalledWith("What's your refund policy?");

    // Verify buildSystemPrompt received RAG context (RagChunk[])
    const promptArgs = mocks.buildSystemPrompt.mock.calls[0][0];
    expect(promptArgs.ragContext).toEqual(ragContext);
    expect(promptArgs.proactiveContext).toEqual(proactiveContext);
  });

  it('reuses existing conversation (skips transaction)', async () => {
    setupReuseConversationFlow();

    const result = await handleMessage(makeInput());

    expect(result.conversationId).toBe(CONVERSATION_ID);
    expect(result.responseText).toBe('Welcome back!');

    // No transaction — conversation already exists
    expect(mocks.transactionFn).not.toHaveBeenCalled();

    // 13 queries incl. customer memory (no transaction)
    expect(mocks.queryFn).toHaveBeenCalledTimes(13);
  });

  it('includes conversation history in LLM messages', async () => {
    // History rows in DESC order (as DB returns them), including current message
    const historyRows = [
      { role: 'customer', content: 'Hello' },         // most recent (just saved in Step 5)
      { role: 'artifact', content: 'Previous reply' },
      { role: 'customer', content: 'First message' },
    ];

    setupNewConversationFlow({ historyRows });

    await handleMessage(makeInput());

    const genArgs = mocks.generateText.mock.calls[0][0];
    const messages = genArgs.messages;

    // Handler reverses DESC to chronological, maps roles
    expect(messages).toEqual([
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Previous reply' },
      { role: 'user', content: 'Hello' },
    ]);
  });

  it('logs complete telemetry and finalizes trace', async () => {
    const { trace } = setupNewConversationFlow();

    const result = await handleMessage(makeInput());

    // trace.finalize called with metrics
    expect(trace.finalize).toHaveBeenCalledOnce();
    const finalizeArgs = trace.finalize.mock.calls[0][0];
    expect(finalizeArgs.modelUsed).toBe('google/gemini-2.0-flash-001');
    expect(finalizeArgs.tokensIn).toBe(100);
    expect(finalizeArgs.tokensOut).toBe(20);
    expect(finalizeArgs.costUsd).toBeGreaterThan(0);
    expect(finalizeArgs.latencyMs).toBeGreaterThanOrEqual(0);

    // trace.setMetadata called for artifactId and conversationId
    expect(trace.setMetadata).toHaveBeenCalledWith({ artifactId: ARTIFACT_ID });
    expect(trace.setMetadata).toHaveBeenCalledWith({ conversationId: CONVERSATION_ID });

    // Result matches trace output
    expect(result.tokensIn).toBe(finalizeArgs.tokensIn);
    expect(result.tokensOut).toBe(finalizeArgs.tokensOut);
  });

  // ── Grounding check integration ──

  it('replaces hallucinated response with safe fallback when grounding fails', async () => {
    setupNewConversationFlow({ intent: COMPLEX_INTENT });
    mocks.searchKnowledge.mockResolvedValue({
      directContext: [], proactiveContext: [],
      totalTokensUsed: 0, docsRetrieved: 0, searchSkipped: false,
    });
    mocks.generateText.mockResolvedValue({
      text: 'We offer property management services!',
      usage: { promptTokens: 100, completionTokens: 20 },
      steps: [],
    });

    // Enable grounding check for this test
    mocks.shouldCheckGrounding.mockReturnValue(true);
    mocks.checkGrounding.mockResolvedValue({
      passed: false,
      violation: 'Claims property management without context',
      safeResponse: "I'd love to help! I don't have specific details right now.",
      tokensIn: 80,
      tokensOut: 10,
      modelUsed: 'google/gemini-2.0-flash-001',
    });

    const result = await handleMessage(makeInput({ messageText: 'What services do you offer?' }));

    // Response replaced with safe fallback
    expect(result.responseText).toBe("I'd love to help! I don't have specific details right now.");
    expect(result.groundingCheck).toEqual({
      passed: false,
      violation: 'Claims property management without context',
      replacedResponse: true,
      groundingModelUsed: 'google/gemini-2.0-flash-001',
      groundingCostUsd: expect.any(Number),
    });
  });

  it('keeps original response when grounding check errors (fail-open)', async () => {
    setupNewConversationFlow();

    mocks.shouldCheckGrounding.mockReturnValue(true);
    mocks.checkGrounding.mockRejectedValue(new Error('LLM timeout'));

    const result = await handleMessage(makeInput());

    // Original response kept despite grounding error
    expect(result.responseText).toBe('Hello! How can I help you today?');
    expect(result.groundingCheck).toEqual({
      passed: true,
      violation: undefined,
      replacedResponse: false,
      error: expect.stringContaining('LLM timeout'),
    });
  });

  it('accumulates grounding check tokens into cost totals', async () => {
    setupNewConversationFlow();
    mocks.generateText.mockResolvedValue({
      text: 'Hello!',
      usage: { promptTokens: 100, completionTokens: 20 },
      steps: [],
    });

    mocks.shouldCheckGrounding.mockReturnValue(true);
    mocks.checkGrounding.mockResolvedValue({
      passed: true,
      tokensIn: 50,
      tokensOut: 5,
      modelUsed: 'google/gemini-2.0-flash-001',
    });

    const result = await handleMessage(makeInput());

    // Totals = main (100+20) + grounding (50+5)
    expect(result.tokensIn).toBe(150);
    expect(result.tokensOut).toBe(25);
    // Cost should include both main and grounding
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.groundingCheck).toEqual({
      passed: true,
      violation: undefined,
      replacedResponse: false,
      groundingModelUsed: 'google/gemini-2.0-flash-001',
      groundingCostUsd: expect.any(Number),
    });
  });
});
