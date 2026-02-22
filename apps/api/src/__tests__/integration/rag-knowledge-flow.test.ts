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
    messageText: "What's your return policy?",
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

const PRODUCT_INTENT = {
  type: 'product_inquiry',
  confidence: 0.92,
  complexity: 'complex' as const,
  requires_knowledge_base: true,
  sentiment: 'neutral' as const,
  source: 'llm' as const,
};

const GREETING_INTENT = {
  type: 'greeting',
  confidence: 0.85,
  complexity: 'simple' as const,
  requires_knowledge_base: false,
  sentiment: 'neutral' as const,
  source: 'regex' as const,
};

/**
 * Set up the full pipeline for RAG tests.
 * @param ragResult - override searchKnowledge result
 * @param learnings - array of learning rows from Step 8
 * @param intent - intent classification result
 */
function setupRagFlow(opts?: {
  ragResult?: Any;
  learnings?: Any[];
  intent?: typeof PRODUCT_INTENT | typeof GREETING_INTENT;
}) {
  const trace = makeTraceContext();
  mocks.createTrace.mockReturnValue(trace);

  const intent = opts?.intent ?? PRODUCT_INTENT;

  mocks.classifyIntent.mockResolvedValue(intent);
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID, artifactName: 'Support Bot',
      artifactType: 'customer_support', source: 'tenant_default_fallback',
      isNewConversation: true,
    }),
  });
  mocks.selectModel.mockReturnValue({ tier: 'balanced', model: 'openai/gpt-4o-mini' });
  mocks.buildSystemPrompt.mockReturnValue('You are Support Bot...');
  mocks.createLLMClient.mockReturnValue((m: string) => ({ modelId: m }));
  mocks.searchKnowledge.mockResolvedValue(opts?.ragResult ?? {
    directContext: [], proactiveContext: [],
    totalTokensUsed: 0, docsRetrieved: 0, searchSkipped: true,
  });
  mocks.generateText.mockResolvedValue({
    text: 'Our return policy allows returns within 30 days.',
    usage: { promptTokens: 200, completionTokens: 40 },
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
              name: 'Acme Corp', planTier: 'starter',
              monthlyCostBudgetUsd: null, defaultArtifactId: ARTIFACT_ID,
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
      select: () => ({ from: () => ({ where: () => [{ totalCost: '1.00' }] }) }),
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
      insert: () => ({ values: () => ({ returning: () => [{ id: CONVERSATION_ID }] }) }),
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
      insert: () => ({ values: () => ({ returning: () => [{ id: MESSAGE_ID }] }) }),
    };
    return fn(mockDb);
  });

  // #7 query — Step 6: Load artifact config
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{
              id: ARTIFACT_ID, name: 'Support Bot', type: 'customer_support',
              personality: { tone: 'helpful' }, constraints: {}, config: {},
            }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #6 query — Step 6b: Fetch module bindings (none for RAG tests)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }),
    };
    return fn(mockDb);
  });

  // #7 query — Step 8: Fetch learnings
  const learningRows = opts?.learnings ?? [];
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: () => learningRows }),
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #8 query — Step 11: Fetch conversation history
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => [{ role: 'customer', content: "What's your return policy?" }],
            }),
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #9 query — Step 13: Save response message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #10 query — Step 14: Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // #11 query — Step 15: Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });

  return { trace };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleMessage — RAG knowledge flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test_key');
  });

  it('includes RAG context in system prompt', async () => {
    const directContext = ['Our refund policy allows returns within 30 days.'];
    const proactiveContext = ['We also offer free exchanges on all items.'];

    setupRagFlow({
      ragResult: {
        directContext,
        proactiveContext,
        totalTokensUsed: 250,
        docsRetrieved: 2,
        searchSkipped: false,
      },
    });

    await handleMessage(makeInput());

    const promptArgs = mocks.buildSystemPrompt.mock.calls[0][0];
    expect(promptArgs.ragContext).toEqual(directContext);
    expect(promptArgs.proactiveContext).toEqual(proactiveContext);
  });

  it('skips RAG for greeting intent', async () => {
    setupRagFlow({
      intent: GREETING_INTENT,
      ragResult: {
        directContext: [],
        proactiveContext: [],
        totalTokensUsed: 0,
        docsRetrieved: 0,
        searchSkipped: true,
      },
    });

    await handleMessage(makeInput({ messageText: 'Hello!' }));

    // searchKnowledge still called but returns skipped
    expect(mocks.searchKnowledge).toHaveBeenCalledOnce();

    const promptArgs = mocks.buildSystemPrompt.mock.calls[0][0];
    expect(promptArgs.ragContext).toEqual([]);
    expect(promptArgs.proactiveContext).toEqual([]);
  });

  it('passes correct args to searchKnowledge', async () => {
    setupRagFlow();

    await handleMessage(makeInput());

    expect(mocks.searchKnowledge).toHaveBeenCalledOnce();
    const args = mocks.searchKnowledge.mock.calls[0][0];

    expect(args.queryText).toBe("What's your return policy?");
    expect(args.intent).toEqual(PRODUCT_INTENT);
    expect(args.tenantId).toBe(TENANT_ID);
    expect(typeof args.embed).toBe('function');
    expect(typeof args.matchKnowledge).toBe('function');

    // embed should be generateEmbedding
    expect(args.embed).toBe(mocks.generateEmbedding);
  });

  it('includes learnings in system prompt', async () => {
    const learningRows = [
      { content: 'Always mention our satisfaction guarantee.' },
      { content: 'Shipping is free over $50.' },
    ];

    setupRagFlow({ learnings: learningRows });

    await handleMessage(makeInput());

    const promptArgs = mocks.buildSystemPrompt.mock.calls[0][0];
    expect(promptArgs.learnings).toEqual([
      'Always mention our satisfaction guarantee.',
      'Shipping is free over $50.',
    ]);
  });

  it('handles empty RAG + empty learnings gracefully', async () => {
    setupRagFlow({
      ragResult: {
        directContext: [],
        proactiveContext: [],
        totalTokensUsed: 0,
        docsRetrieved: 0,
        searchSkipped: true,
      },
      learnings: [],
    });

    const result = await handleMessage(makeInput());

    // Pipeline completes normally
    expect(result.responseText).toBe('Our return policy allows returns within 30 days.');
    expect(result.budgetExceeded).toBeUndefined();

    // buildSystemPrompt receives empty arrays
    const promptArgs = mocks.buildSystemPrompt.mock.calls[0][0];
    expect(promptArgs.ragContext).toEqual([]);
    expect(promptArgs.proactiveContext).toEqual([]);
    expect(promptArgs.learnings).toEqual([]);
  });
});
