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
    messageText: 'I want to book a demo',
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

const MODULE_BINDING = {
  moduleSlug: 'qualify_lead',
  moduleId: '00000000-0000-0000-0000-000000000010',
  moduleName: 'Lead Qualifier',
  moduleDescription: 'Qualifies leads by collecting contact info',
  autonomyLevel: 'fully_autonomous',
  configOverrides: {},
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
};

const SECOND_MODULE_BINDING = {
  moduleSlug: 'schedule_meeting',
  moduleId: '00000000-0000-0000-0000-000000000011',
  moduleName: 'Meeting Scheduler',
  moduleDescription: 'Schedules meetings with prospects',
  autonomyLevel: 'draft_and_approve',
  configOverrides: {},
  inputSchema: { type: 'object', properties: { date: { type: 'string' } } },
};

/**
 * Set up the full pipeline flow for module tool-calling tests.
 * @param modules - array of module bindings to return from Step 6b
 * @param steps - array of generateText steps (with toolCalls) to return
 */
function setupModuleFlow(opts: {
  modules: Any[];
  steps?: Any[];
}) {
  const trace = makeTraceContext();
  mocks.createTrace.mockReturnValue(trace);

  // @camello/ai mocks
  mocks.classifyIntent.mockResolvedValue({
    type: 'booking_request', confidence: 0.9, complexity: 'moderate',
    requires_knowledge_base: false, sentiment: 'positive', source: 'llm',
  });
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID, artifactName: 'Sales Bot',
      artifactType: 'sales', source: 'tenant_default_fallback',
      isNewConversation: true,
    }),
  });
  mocks.selectModel.mockReturnValue({ tier: 'balanced', model: 'openai/gpt-4o-mini' });
  mocks.buildSystemPrompt.mockReturnValue('You are Sales Bot...');
  mocks.createLLMClient.mockReturnValue((m: string) => ({ modelId: m }));
  mocks.searchKnowledge.mockResolvedValue({
    directContext: [], proactiveContext: [],
    totalTokensUsed: 0, docsRetrieved: 0, searchSkipped: true,
  });

  // Build fake tools when modules exist
  if (opts.modules.length > 0) {
    mocks.buildToolsFromBindings.mockReturnValue({
      qualify_lead: { description: 'Qualify lead', parameters: {} },
      schedule_meeting: { description: 'Schedule meeting', parameters: {} },
    });
  }

  mocks.generateText.mockResolvedValue({
    text: "I'd be happy to help you book a demo!",
    usage: { promptTokens: 150, completionTokens: 30 },
    steps: opts.steps ?? [],
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
              id: ARTIFACT_ID, name: 'Sales Bot', type: 'sales',
              personality: {}, constraints: {}, config: {},
            }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #6 query — Step 6b: Fetch module bindings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => opts.modules }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // #7 query — Step 8: Fetch learnings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({ orderBy: () => ({ limit: () => [] }) }),
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
              limit: () => [{ role: 'customer', content: 'I want to book a demo' }],
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

describe('handleMessage — module tool-calling integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test_key');
  });

  it('passes tools to generateText with maxSteps: 5 when modules bound', async () => {
    setupModuleFlow({ modules: [MODULE_BINDING] });

    await handleMessage(makeInput());

    expect(mocks.buildToolsFromBindings).toHaveBeenCalledOnce();

    const genArgs = mocks.generateText.mock.calls[0][0];
    expect(genArgs.tools).toBeDefined();
    expect(genArgs.maxSteps).toBe(5);
  });

  it('skips tools when no modules bound', async () => {
    setupModuleFlow({ modules: [] });

    await handleMessage(makeInput());

    expect(mocks.buildToolsFromBindings).not.toHaveBeenCalled();

    const genArgs = mocks.generateText.mock.calls[0][0];
    expect(genArgs.tools).toBeUndefined();
    expect(genArgs.maxSteps).toBe(1);
  });

  it('extracts tool call from steps into moduleExecutions', async () => {
    setupModuleFlow({
      modules: [MODULE_BINDING],
      steps: [
        {
          toolCalls: [
            { toolName: 'qualify_lead', args: { name: 'John' }, toolCallId: 'tc_1' },
          ],
        },
      ],
    });

    const result = await handleMessage(makeInput());

    expect(result.moduleExecutions).toEqual([
      { moduleSlug: 'qualify_lead', status: 'invoked' },
    ]);
  });

  it('extracts multiple tool calls from multiple steps', async () => {
    setupModuleFlow({
      modules: [MODULE_BINDING, SECOND_MODULE_BINDING],
      steps: [
        {
          toolCalls: [
            { toolName: 'qualify_lead', args: { name: 'Jane' }, toolCallId: 'tc_1' },
          ],
        },
        {
          toolCalls: [
            { toolName: 'schedule_meeting', args: { date: '2026-03-01' }, toolCallId: 'tc_2' },
          ],
        },
      ],
    });

    const result = await handleMessage(makeInput());

    expect(result.moduleExecutions).toEqual([
      { moduleSlug: 'qualify_lead', status: 'invoked' },
      { moduleSlug: 'schedule_meeting', status: 'invoked' },
    ]);
    expect(result.moduleExecutions).toHaveLength(2);
  });

  it('builds tools with correct DI dependencies', async () => {
    setupModuleFlow({ modules: [MODULE_BINDING] });

    await handleMessage(makeInput());

    const args = mocks.buildToolsFromBindings.mock.calls[0];
    const bindings = args[0];
    const deps = args[1];

    // Bindings passed through
    expect(bindings).toHaveLength(1);
    expect(bindings[0].moduleSlug).toBe('qualify_lead');

    // DI deps
    expect(deps.tenantId).toBe(TENANT_ID);
    expect(deps.artifactId).toBe(ARTIFACT_ID);
    expect(deps.conversationId).toBe(CONVERSATION_ID);
    expect(deps.customerId).toBe(CUSTOMER_ID);
    expect(deps.triggerMessageId).toBe(MESSAGE_ID);
    expect(deps.db).toBeDefined();
    expect(typeof deps.db.insertLead).toBe('function');
    expect(typeof deps.db.insertModuleExecution).toBe('function');
    expect(typeof deps.db.updateModuleExecution).toBe('function');
    expect(typeof deps.onApprovalNeeded).toBe('function');
  });
});
