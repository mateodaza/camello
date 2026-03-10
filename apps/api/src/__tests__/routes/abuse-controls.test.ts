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
  shouldCheckGrounding: vi.fn(),
  checkGrounding: vi.fn(),
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
  shouldCheckGrounding: mocks.shouldCheckGrounding,
  checkGrounding: mocks.checkGrounding,
  flattenRagChunks: (chunks: Array<{ content: string }>) => chunks.map((c) => c.content),
  parseMemoryFacts: () => [],
  sanitizeFactValue: (v: string) => v,
  MAX_INJECTED_FACTS: 6,
  parseMemoryTags: vi.fn(() => []),
  stripMemoryTags: vi.fn((text: string) => text),
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

/** Setup steps 0 (tenant info) + 1 (budget check) — always under budget */
function setupBaseline(opts?: { dailyCount?: number }) {
  const trace = makeTraceContext();
  mocks.createTrace.mockReturnValue(trace);

  // #1 query — Fetch tenant info
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{
              name: 'Acme Corp',
              planTier: 'growth',
              monthlyCostBudgetUsd: null,
              defaultArtifactId: ARTIFACT_ID,
              settings: {},
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

  // #2 query — Budget check (under budget)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => [{ totalCost: '1.00' }],
        }),
      }),
    };
    return fn(mockDb);
  });

  // #3 query — Daily customer ceiling count
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => [{ count: opts?.dailyCount ?? 5 }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  return { trace };
}

/** Mock the daily limit handler DB writes (no existingConversationId, defaultArtifactId available) */
function setupDailyLimitDbWrites() {
  // Create conversation + assignment (no existing conv)
  mocks.transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = {
      insert: () => ({
        values: () => ({ returning: () => [{ id: CONVERSATION_ID }] }),
      }),
    };
    return fn(mockTx);
  });

  // Save customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Save canned response
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });
}

/** Mock the conversation limit handler DB writes (with existingConversationId) */
function setupConvLimitDbWrites() {
  // Look up artifact assignment from existing conversation
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ artifactId: ARTIFACT_ID }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });

  // Has conversationId → skip create

  // Save customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Save canned response
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleMessage — abuse controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'http://localhost:54321');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test_key');
    mocks.shouldCheckGrounding.mockReturnValue(false);
  });

  // ── Daily customer ceiling ──

  describe('daily customer ceiling (100 msgs/day)', () => {
    it('blocks pipeline when daily count >= 100', async () => {
      setupBaseline({ dailyCount: 100 });
      setupDailyLimitDbWrites();

      const result = await handleMessage(makeInput());

      expect(result.dailyLimitReached).toBe(true);
      expect(result.costUsd).toBe(0);
      expect(result.tokensIn).toBe(0);
      expect(result.modelUsed).toBe('daily_limit');

      // No paid AI work
      expect(mocks.classifyIntent).not.toHaveBeenCalled();
      expect(mocks.generateText).not.toHaveBeenCalled();
      expect(mocks.searchKnowledge).not.toHaveBeenCalled();
    });

    it('allows pipeline when daily count < 100', async () => {
      setupBaseline({ dailyCount: 99 });

      // Conversation cap skipped (no existingConversationId)
      // Pipeline continues — mock remaining steps (classify + full flow)
      setupFullPipelineAfterDailyCheck();

      const result = await handleMessage(makeInput());

      expect(result.dailyLimitReached).toBeUndefined();
      expect(mocks.classifyIntent).toHaveBeenCalledOnce();
    });

    it('propagates dailyLimitReached flag in output', async () => {
      setupBaseline({ dailyCount: 150 });
      setupDailyLimitDbWrites();

      const result = await handleMessage(makeInput());

      expect(result.dailyLimitReached).toBe(true);
      expect(result.conversationLimitReached).toBeUndefined();
      expect(result.budgetExceeded).toBeUndefined();
    });
  });

  // ── Conversation cap (phase A — widget path) ──

  describe('conversation cap phase A (existingConversationId)', () => {
    it('blocks pipeline when conversation has >= 50 messages', async () => {
      setupBaseline({ dailyCount: 10 });

      // #4 query — Conversation cap check (50+ msgs)
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              innerJoin: () => ({
                where: () => [{ count: 50 }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      setupConvLimitDbWrites();

      const result = await handleMessage(makeInput({
        existingConversationId: CONVERSATION_ID,
      }));

      expect(result.conversationLimitReached).toBe(true);
      expect(result.costUsd).toBe(0);
      expect(mocks.classifyIntent).not.toHaveBeenCalled();
    });

    it('skips conversation cap for new conversations (no existingConversationId)', async () => {
      setupBaseline({ dailyCount: 10 });
      // No conversation cap query — proceeds to pipeline
      setupFullPipelineAfterDailyCheck();

      const result = await handleMessage(makeInput());

      // Pipeline ran (no cap check for new conversations)
      expect(result.conversationLimitReached).toBeUndefined();
      expect(mocks.classifyIntent).toHaveBeenCalledOnce();
    });

    it('allows pipeline when conversation has < 50 messages', async () => {
      setupBaseline({ dailyCount: 10 });

      // #4 query — Conversation cap check (under limit)
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              innerJoin: () => ({
                where: () => [{ count: 49 }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      setupFullPipelineAfterConvCheck();

      const result = await handleMessage(makeInput({
        existingConversationId: CONVERSATION_ID,
      }));

      expect(result.conversationLimitReached).toBeUndefined();
      expect(mocks.classifyIntent).toHaveBeenCalledOnce();
    });
  });

  // ── Conversation cap (phase B — resolver-found) ──

  describe('conversation cap phase B (WhatsApp / resolver-found)', () => {
    it('checks resolved conversation after findOrCreateConversation', async () => {
      const RESOLVED_CONV_ID = '00000000-0000-0000-0000-000000000099';

      setupBaseline({ dailyCount: 10 });
      // No existingConversationId → skip phase A

      // Pipeline runs through classify + resolver + findOrCreate
      setupPipelineUntilPhaseB(RESOLVED_CONV_ID);

      // Phase B conversation cap check (50+ msgs on resolved conv)
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => [{ count: 55 }],
            }),
          }),
        };
        return fn(mockDb);
      });

      // handleConversationLimitReached with existingConversationId:
      // 1. Look up artifact assignment from existing conversation
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [{ artifactId: ARTIFACT_ID }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });
      // 2. Save customer message
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = { insert: () => ({ values: () => ({}) }) };
        return fn(mockDb);
      });
      // 3. Save canned response
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = { insert: () => ({ values: () => ({}) }) };
        return fn(mockDb);
      });
      // 4. Log telemetry
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = { insert: () => ({ values: () => ({}) }) };
        return fn(mockDb);
      });
      // 5. Update conversation timestamp
      mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
        const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
        return fn(mockDb);
      });

      const result = await handleMessage(makeInput());

      expect(result.conversationLimitReached).toBe(true);
      // classifyIntent was called (unavoidable — resolver needs intent)
      expect(mocks.classifyIntent).toHaveBeenCalledOnce();
      // But no LLM generation happened
      expect(mocks.generateText).not.toHaveBeenCalled();
    });
  });

  // ── Output contract ──

  describe('limit handler output contract', () => {
    it('returns all required HandleMessageOutput fields', async () => {
      setupBaseline({ dailyCount: 100 });
      setupDailyLimitDbWrites();

      const result = await handleMessage(makeInput());

      expect(result).toHaveProperty('conversationId');
      expect(result).toHaveProperty('artifactId');
      expect(result).toHaveProperty('responseText');
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('modelUsed');
      expect(result).toHaveProperty('tokensIn');
      expect(result).toHaveProperty('tokensOut');
      expect(result).toHaveProperty('costUsd');
      expect(result).toHaveProperty('latencyMs');
      expect(result).toHaveProperty('moduleExecutions');
      expect(result.moduleExecutions).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Flow setup helpers
// ---------------------------------------------------------------------------

/** Set up full pipeline after daily check passes (for new conversation, no existingConversationId) */
function setupFullPipelineAfterDailyCheck() {
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

  // Create conversation
  mocks.transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = {
      insert: () => ({ values: () => ({ returning: () => [{ id: CONVERSATION_ID }] }) }),
    };
    return fn(mockTx);
  });

  // Phase B conversation cap check (under limit — no existingConversationId in input)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => [{ count: 5 }] }) }),
    };
    return fn(mockDb);
  });

  // Insert customer message
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({ returning: () => [{ id: 'msg_1' }] }) }) };
    return fn(mockDb);
  });

  // Load artifact config
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({
        limit: () => [{ id: ARTIFACT_ID, name: 'Support Bot', type: 'customer_support',
          personality: {}, constraints: {}, config: {} }],
      }) }) }),
    };
    return fn(mockDb);
  });

  // Fetch module bindings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }) };
    return fn(mockDb);
  });

  // Fetch learnings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }),
    };
    return fn(mockDb);
  });

  // Fetch conversation history
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [
        { role: 'customer', content: 'Hello' },
      ] }) }) }) }),
    };
    return fn(mockDb);
  });

  // Save response
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });
}

/** Setup pipeline after conversation cap check passes (existing conversation, under 50) */
function setupFullPipelineAfterConvCheck() {
  mocks.classifyIntent.mockResolvedValue({
    type: 'greeting', confidence: 0.85, complexity: 'simple',
    requires_knowledge_base: false, sentiment: 'neutral', source: 'regex',
  });
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID, artifactName: 'Support Bot',
      artifactType: 'customer_support', source: 'existing_conversation',
      conversationId: CONVERSATION_ID,
      isNewConversation: false,
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
    text: 'Continued conversation', usage: { promptTokens: 80, completionTokens: 15 }, steps: [],
  });
  mocks.createClient.mockReturnValue({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  });

  // Insert customer message (existing conv, no transaction needed)
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({ returning: () => [{ id: 'msg_1' }] }) }) };
    return fn(mockDb);
  });

  // Load artifact config
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({
        limit: () => [{ id: ARTIFACT_ID, name: 'Support Bot', type: 'customer_support',
          personality: {}, constraints: {}, config: {} }],
      }) }) }),
    };
    return fn(mockDb);
  });

  // Fetch module bindings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => [] }) }) }) };
    return fn(mockDb);
  });

  // Fetch learnings
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [] }) }) }) }),
    };
    return fn(mockDb);
  });

  // Fetch conversation history
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = {
      select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => [
        { role: 'customer', content: 'Hello' },
      ] }) }) }) }),
    };
    return fn(mockDb);
  });

  // Save response
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Log telemetry
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { insert: () => ({ values: () => ({}) }) };
    return fn(mockDb);
  });

  // Update conversation timestamp
  mocks.queryFn.mockImplementationOnce(async (fn: Any) => {
    const mockDb = { update: () => ({ set: () => ({ where: () => ({}) }) }) };
    return fn(mockDb);
  });
}

/**
 * Setup pipeline through classify + resolver + findOrCreate but before phase B check.
 * Used to test phase B conversation cap on resolver-found conversations.
 * Resolver returns conversationId → findOrCreateConversation returns it without transaction.
 * Phase B fires because !existingConversationId (not in input).
 */
function setupPipelineUntilPhaseB(resolvedConvId: string) {
  mocks.classifyIntent.mockResolvedValue({
    type: 'greeting', confidence: 0.85, complexity: 'simple',
    requires_knowledge_base: false, sentiment: 'neutral', source: 'regex',
  });
  mocks.createArtifactResolver.mockReturnValue({
    resolve: vi.fn().mockResolvedValue({
      artifactId: ARTIFACT_ID, artifactName: 'Support Bot',
      artifactType: 'customer_support', source: 'existing_conversation',
      conversationId: resolvedConvId,
      isNewConversation: false,
    }),
  });
  mocks.selectModel.mockReturnValue({ tier: 'fast', model: 'google/gemini-2.0-flash-001' });
  mocks.buildSystemPrompt.mockReturnValue('You are Support Bot...');
  mocks.createLLMClient.mockReturnValue((m: string) => ({ modelId: m }));

  mocks.createClient.mockReturnValue({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  });

  // No transaction — findOrCreateConversation returns resolved conversationId directly
}
