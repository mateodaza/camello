import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // tenantDb
  queryFn: vi.fn(),
  transactionFn: vi.fn(),
  recordKnowledgeGap: vi.fn(),
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
  getIntentProfile: vi.fn(),
  fetchAdvisorSnapshot: vi.fn(),
  // ai SDK
  generateText: vi.fn(),
  // langfuse
  createTrace: vi.fn(),
  // supabase
  createClient: vi.fn(),
  // date-utils
  getUtcMonthWindow: vi.fn(),
  // skills
  resolveSkills: vi.fn(),
}));

vi.mock('../../orchestration/knowledge-gap.js', () => ({
  recordKnowledgeGap: mocks.recordKnowledgeGap,
  TRIVIAL_INTENTS: new Set(['greeting', 'farewell', 'thanks']),
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
  checkGroundingWithRetry: vi.fn(),
  getIntentProfile: mocks.getIntentProfile,
  isHighRiskIntent: vi.fn(() => false),
  responseContainsClaims: vi.fn(() => false),
  flattenRagChunks: (chunks: Array<{ content: string }>) => chunks.map((c) => c.content),
  parseMemoryFacts: () => [],
  mergeMemoryFacts: vi.fn(),
  parseMemoryTags: vi.fn(() => []),
  stripMemoryTags: vi.fn((text: string) => text),
  sanitizeFactValue: (v: string) => v,
  MAX_INJECTED_FACTS: 6,
  SAFE_FALLBACKS: {},
  resolveSkills: mocks.resolveSkills,
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

vi.mock('@camello/shared/messages', () => ({ t: vi.fn() }));

vi.mock('../../lib/date-utils.js', () => ({
  getUtcMonthWindow: mocks.getUtcMonthWindow,
}));

vi.mock('../../lib/email.js', () => ({
  sendEmail: vi.fn(),
  renderBaseEmail: vi.fn(),
}));

vi.mock('../../lib/advisor-snapshot.js', () => ({
  fetchAdvisorSnapshot: mocks.fetchAdvisorSnapshot,
}));

import { handleMessage } from '../../orchestration/message-handler.js';

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000004';
const MESSAGE_ID = '00000000-0000-0000-0000-000000000005';

const FIXTURE_SNAPSHOT = {
  activeConversations: 7,
  conversationTrend: 40,
  pendingPayments: { count: 2, byCurrency: [{ currency: 'USD', totalAmount: 300 }] },
  paidPayments: { count: 5, totalAmount: 1500 },
  leadsByStage: { new: 4, qualifying: 2 },
  topKnowledgeGaps: [],
  pendingApprovals: 0,
  recentExecutions: [],
};

function makeTenantDb() {
  return { query: mocks.queryFn, transaction: mocks.transactionFn } as Any;
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test_key');

  mocks.getUtcMonthWindow.mockReturnValue({
    monthStart: new Date('2026-01-01'),
    nextMonthStart: new Date('2026-02-01'),
  });
  mocks.shouldCheckGrounding.mockReturnValue(false);
  mocks.createTrace.mockReturnValue(makeTraceContext());
  mocks.selectModel.mockReturnValue({ tier: 'balanced', model: 'openai/gpt-4o-mini' });
  mocks.buildSystemPrompt.mockReturnValue('You are Test Agent...');
  mocks.createLLMClient.mockReturnValue((m: string) => ({ modelId: m }));
  mocks.buildToolsFromBindings.mockReturnValue([]);
  mocks.generateText.mockResolvedValue({
    text: 'Here is your answer.',
    usage: { promptTokens: 100, completionTokens: 20 },
    steps: [],
  });
  mocks.createClient.mockReturnValue({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  });
  mocks.recordKnowledgeGap.mockResolvedValue(undefined);
  mocks.resolveSkills.mockReturnValue([]);

  mocks.searchKnowledge.mockResolvedValue({
    directContext: [],
    proactiveContext: [],
    searchSkipped: false,
    totalTokensUsed: 0,
    docsRetrieved: 0,
  });

  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID,
      artifactName: 'Sales Agent',
      artifactType: 'sales',
      source: 'override',
      isNewConversation: true,
    }),
  });
});

/** 14-call DB sequence yielding a 'sales' artifact */
function setupSalesPipeline() {
  // #1: tenant fetch
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [{ name: 'Acme Corp', planTier: 'starter', monthlyCostBudgetUsd: null, defaultArtifactId: null, settings: {} }] }) }) }) })
  );
  // #2: customer memory
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [{ memory: null, displayName: 'Customer', name: 'Customer' }] }) }) }) })
  );
  // #3: budget check
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => [{ totalCost: '1.00' }] }) }) })
  );
  // #4: daily ceiling count
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [{ count: 5 }] }) }) }) })
  );
  // #5: create conversation + assignment — TRANSACTION
  mocks.transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = { insert: () => ({ values: () => ({ returning: () => [{ id: CONVERSATION_ID }] }) }) };
    return fn(mockTx);
  });
  // #6: phase B cap check
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => [{ count: 5 }] }) }) })
  );
  // #7: insert customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ insert: () => ({ values: () => ({ returning: () => [{ id: MESSAGE_ID }] }) }) })
  );
  // #8: sales artifact
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [{ id: ARTIFACT_ID, name: 'Sales Agent', type: 'sales', personality: {}, constraints: {}, config: {} }] }) }) }) })
  );
  // #9: module bindings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }) })
  );
  // #10: learnings fetch
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }) })
  );
  // #11: history fetch
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }) })
  );
  // #12: save response message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ insert: () => ({ values: () => ({}) }) })
  );
  // #13: log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ insert: () => ({ values: () => ({}) }) })
  );
  // #14: update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ update: () => ({ set: () => ({ where: () => ({}) }) }) })
  );
}

/** 14-call DB sequence yielding an 'advisor' artifact */
function setupAdvisorPipeline() {
  // #1: tenant fetch
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [{ name: 'Acme Corp', planTier: 'starter', monthlyCostBudgetUsd: null, defaultArtifactId: null, settings: {} }] }) }) }) })
  );
  // #2: customer memory
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [{ memory: null, displayName: 'Owner', name: 'Owner' }] }) }) }) })
  );
  // #3: budget check
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => [{ totalCost: '1.00' }] }) }) })
  );
  // #4: daily ceiling count
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [{ count: 5 }] }) }) }) })
  );
  // #5: create conversation + assignment — TRANSACTION
  mocks.transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = { insert: () => ({ values: () => ({ returning: () => [{ id: CONVERSATION_ID }] }) }) };
    return fn(mockTx);
  });
  // #6: phase B cap check
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => [{ count: 5 }] }) }) })
  );
  // #7: insert customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ insert: () => ({ values: () => ({ returning: () => [{ id: MESSAGE_ID }] }) }) })
  );
  // #8: advisor artifact
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [{ id: ARTIFACT_ID, name: 'Test Advisor', type: 'advisor', personality: {}, constraints: {}, config: {} }] }) }) }) })
  );
  // #9: module bindings (skipped for advisor — empty)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }) })
  );
  // NOTE: fetchAdvisorSnapshot is mocked (no queryFn consumed)
  // #10: learnings fetch
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }) })
  );
  // #11: history fetch
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }) })
  );
  // #12: save response message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ insert: () => ({ values: () => ({}) }) })
  );
  // #13: log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ insert: () => ({ values: () => ({}) }) })
  );
  // #14: update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) =>
    fn({ update: () => ({ set: () => ({ where: () => ({}) }) }) })
  );
}

describe('skill resolution in message-handler (NC-305)', () => {
  it('Test 1 — resolveSkills called and passed to buildSystemPrompt for pricing intent', async () => {
    setupSalesPipeline();
    mocks.classifyIntent.mockResolvedValue({
      type: 'pricing',
      source: 'llm',
      confidence: 0.95,
      complexity: 'simple' as const,
      requires_knowledge_base: false,
      sentiment: 'neutral' as const,
    });
    mocks.getIntentProfile.mockReturnValue({
      includeArchetypeFramework: true,
      includeModules: true,
      maxSteps: 3,
      maxResponseTokens: 340,
      maxSentences: 5,
      skipGrounding: false,
    });
    mocks.resolveSkills.mockReturnValue([
      { slug: 'objection-pricing', name: 'Objection: Pricing', body: 'Handle price objections...', priority: 10, source: 'platform' },
    ]);

    await handleMessage({
      tenantDb: makeTenantDb(),
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'Your price is too high.',
      artifactId: ARTIFACT_ID,
    });

    expect(mocks.resolveSkills).toHaveBeenCalledOnce();
    expect(mocks.resolveSkills).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ type: 'pricing' }),
      messageText: expect.any(String),
      artifactType: 'sales',
      activeModuleSlugs: expect.any(Array),
      locale: 'en',
    }));
    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      resolvedSkills: [expect.objectContaining({ slug: 'objection-pricing' })],
    }));
  });

  it('Test 2 — resolveSkills skipped for advisor artifact', async () => {
    setupAdvisorPipeline();
    mocks.createArtifactResolver.mockReturnValue({
      resolve: vi.fn().mockResolvedValue({
        artifactId: ARTIFACT_ID,
        artifactName: 'Test Advisor',
        artifactType: 'advisor',
        source: 'override',
        isNewConversation: true,
      }),
    });
    mocks.classifyIntent.mockResolvedValue({
      type: 'product_question',
      source: 'llm' as const,
      confidence: 0.9,
      complexity: 'simple' as const,
      requires_knowledge_base: false,
      sentiment: 'neutral' as const,
    });
    mocks.getIntentProfile.mockReturnValue({
      includeArchetypeFramework: true,
      includeModules: true,
      maxSteps: 3,
      maxResponseTokens: 340,
      maxSentences: 5,
      skipGrounding: false,
    });
    mocks.fetchAdvisorSnapshot.mockResolvedValue(FIXTURE_SNAPSHOT);

    await handleMessage({
      tenantDb: makeTenantDb(),
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'How is my business doing?',
      artifactId: ARTIFACT_ID,
    });

    expect(mocks.resolveSkills).not.toHaveBeenCalled();
    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      resolvedSkills: [],
    }));
  });

  it('Test 3 — resolveSkills skipped for farewell intent (includeArchetypeFramework: false)', async () => {
    setupSalesPipeline();
    mocks.classifyIntent.mockResolvedValue({
      type: 'farewell',
      source: 'regex' as const,
      confidence: 1,
      complexity: 'simple' as const,
      requires_knowledge_base: false,
      sentiment: 'neutral' as const,
    });
    mocks.getIntentProfile.mockReturnValue({
      includeArchetypeFramework: false,
      includeModules: false,
      maxSteps: 1,
      maxResponseTokens: 180,
      maxSentences: 2,
      skipGrounding: true,
    });

    await handleMessage({
      tenantDb: makeTenantDb(),
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'Goodbye!',
      artifactId: ARTIFACT_ID,
    });

    expect(mocks.resolveSkills).not.toHaveBeenCalled();
    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      resolvedSkills: [],
    }));
  });

  it('Test 4 — resolveSkills skipped for greeting:regex (explicit guard; includeArchetypeFramework: true)', async () => {
    setupSalesPipeline();
    mocks.classifyIntent.mockResolvedValue({
      type: 'greeting',
      source: 'regex' as const,
      confidence: 1,
      complexity: 'simple' as const,
      requires_knowledge_base: false,
      sentiment: 'neutral' as const,
    });
    mocks.getIntentProfile.mockReturnValue({
      includeArchetypeFramework: true,
      includeModules: false,
      maxSteps: 1,
      maxResponseTokens: 200,
      maxSentences: 2,
      skipGrounding: true,
    });

    await handleMessage({
      tenantDb: makeTenantDb(),
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'Hi!',
      artifactId: ARTIFACT_ID,
    });

    expect(mocks.resolveSkills).not.toHaveBeenCalled();
    expect(mocks.buildSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      resolvedSkills: [],
    }));
  });
});
