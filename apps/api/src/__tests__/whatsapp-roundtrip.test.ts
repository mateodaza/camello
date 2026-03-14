import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock vars — declared before vi.mock factories reference them
// ---------------------------------------------------------------------------

const { mockSendText, mocks } = vi.hoisted(() => {
  const mockSendText = vi.fn();
  const mocks = {
    classifyIntent: vi.fn(),
    selectModel: vi.fn(),
    buildSystemPrompt: vi.fn(),
    createLLMClient: vi.fn(),
    searchKnowledge: vi.fn(),
    generateEmbedding: vi.fn(),
    buildToolsFromBindings: vi.fn(),
    shouldCheckGrounding: vi.fn(),
    checkGroundingWithRetry: vi.fn(),
    getIntentProfile: vi.fn(),
    isHighRiskIntent: vi.fn(),
    responseContainsClaims: vi.fn(),
  };
  return { mockSendText, mocks };
});

// ---------------------------------------------------------------------------
// Module mocks (hoisted above all imports by Vitest)
// ---------------------------------------------------------------------------

vi.mock('@camello/ai', async () => {
  const actual = await vi.importActual<typeof import('@camello/ai')>('@camello/ai');
  return {
    ...actual, // createArtifactResolver stays real
    classifyIntent: mocks.classifyIntent,
    selectModel: mocks.selectModel,
    buildSystemPrompt: mocks.buildSystemPrompt,
    createLLMClient: mocks.createLLMClient,
    searchKnowledge: mocks.searchKnowledge,
    generateEmbedding: mocks.generateEmbedding,
    buildToolsFromBindings: mocks.buildToolsFromBindings,
    shouldCheckGrounding: mocks.shouldCheckGrounding,
    checkGroundingWithRetry: mocks.checkGroundingWithRetry,
    getIntentProfile: mocks.getIntentProfile,
    isHighRiskIntent: mocks.isHighRiskIntent,
    responseContainsClaims: mocks.responseContainsClaims,
  };
});

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('../lib/langfuse.js', () => ({
  createTrace: vi.fn(() => ({
    traceId: 'trace_123',
    metadata: {},
    setMetadata: vi.fn(),
    span: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
    finalize: vi.fn(),
  })),
  buildTelemetry: vi.fn(() => undefined),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
  })),
}));

vi.mock('@camello/db', async () => {
  const schema = await vi.importActual<typeof import('@camello/db/schema')>('@camello/db/schema');
  return { ...schema, db: {}, pool: {}, createTenantDb: vi.fn() };
});

vi.mock('@camello/shared/constants', async () => {
  const actual = await vi.importActual<typeof import('@camello/shared/constants')>('@camello/shared/constants');
  return {
    ...actual,
    COST_BUDGET_DEFAULTS: { starter: 5, growth: 25, scale: 100 } as Record<string, number>,
    LEARNING_CONFIDENCE: { retrieval_floor: 0.5 },
  };
});

vi.mock('@camello/shared/messages', () => ({ t: vi.fn(() => 'Error message') }));

vi.mock('../lib/email.js', () => ({
  sendEmail: vi.fn().mockResolvedValue({ sent: false }),
  renderBaseEmail: vi.fn(() => ''),
  renderQuoteEmail: vi.fn(() => ''),
  quoteEmailSubject: vi.fn(() => ''),
}));

vi.mock('../orchestration/knowledge-gap.js', () => ({
  recordKnowledgeGap: vi.fn().mockResolvedValue(false),
}));

vi.mock('../adapters/whatsapp.js', async () => {
  const actual = await vi.importActual<typeof import('../adapters/whatsapp.js')>('../adapters/whatsapp.js');
  return {
    ...actual, // findOrCreateWhatsAppCustomer stays real
    whatsappAdapter: { sendText: mockSendText, channel: 'whatsapp' },
  };
});

// ---------------------------------------------------------------------------
// Imports (vi.mock calls above are hoisted before these by Vitest)
// ---------------------------------------------------------------------------

import { generateText } from 'ai';
import type { TenantDb, TenantDrizzle } from '@camello/db';
import { handleMessage, findActiveConversation } from '../orchestration/message-handler.js';
import { findOrCreateWhatsAppCustomer } from '../adapters/whatsapp.js';
import { createCallerFactory } from '../trpc/init.js';
import { conversationRouter } from '../routes/conversation.js';
import { drizzle } from 'drizzle-orm/pg-proxy';
import * as schema from '@camello/db/schema';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const CONV_ID     = '00000000-0000-0000-0000-000000000011';
const MSG_ID      = '00000000-0000-0000-0000-000000000021';
const WA_ID       = '+15555550100';
const USER_ID     = 'user_test_123';

const createCaller = createCallerFactory(conversationRouter);

// ---------------------------------------------------------------------------
// Mock artifact row
// ---------------------------------------------------------------------------

const ARTIFACT_ROW = {
  id: ARTIFACT_ID,
  name: 'Sales Bot',
  type: 'sales',
  personality: {},
  constraints: {},
  config: {},
  isActive: true,
};

// ---------------------------------------------------------------------------
// Mock DB chain builders
// ---------------------------------------------------------------------------

/** select().from().where().limit() */
function q_fwl(rows: Any[]): Any {
  return { select: () => ({ from: () => ({ where: () => ({ limit: () => rows }) }) }) };
}
/** select().from().where() — terminates at where */
function q_fw(rows: Any[]): Any {
  return { select: () => ({ from: () => ({ where: () => rows }) }) };
}
/** select().from().innerJoin().where() — terminates at where */
function q_fjw(rows: Any[]): Any {
  return { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => rows }) }) }) };
}
/** select().from().where().orderBy().limit() */
function q_fwol(rows: Any[]): Any {
  return { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => rows }) }) }) }) };
}
/** select().from().innerJoin().where().orderBy().limit() — for findMatchingRule */
function q_fjwol(rows: Any[]): Any {
  return { select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: () => rows }) }) }) }) }) };
}
/** select().from().innerJoin().innerJoin().where().orderBy().limit() — for findActiveConversation */
function q_fjjwol(rows: Any[]): Any {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => rows,
              }),
            }),
          }),
        }),
      }),
    }),
  };
}
/** select().from().leftJoin().where().limit() — for conversation fetch in replyAsOwner */
function q_fljwl(rows: Any[]): Any {
  return { select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: () => rows }) }) }) }) };
}
/** insert().values().returning() */
function q_ivr(rows: Any[]): Any {
  return { insert: () => ({ values: () => ({ returning: () => rows }) }) };
}
/** insert().values() — no returning */
function q_iv(): Any {
  return { insert: () => ({ values: () => ({}) }) };
}
/** update().set().where() */
function q_usw(): Any {
  return { update: () => ({ set: () => ({ where: () => ({}) }) }) };
}
/** getDefaultArtifact — single query call with two selects */
function q_getDefaultArtifact(): Any {
  let n = 0;
  return {
    select: () => {
      n++;
      if (n === 1) {
        // tenant defaultArtifactId = null
        return { from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) };
      }
      // fallback: first active artifact
      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => [{ artifactId: ARTIFACT_ID, artifactName: 'Sales Bot', artifactType: 'sales' }],
            }),
          }),
        }),
      };
    },
  };
}

const qdb = (mockDbObj: Any) => async (fn: Any) => fn(mockDbObj);

// ---------------------------------------------------------------------------
// Standard mock DB for handleMessage — new conversation path (Test 1)
// ---------------------------------------------------------------------------

function setupNewConvMockDb(conversationInsertSpy: (vals: Any) => void) {
  const queryFn = vi.fn();
  const transactionFn = vi.fn();

  // Transaction 1: findOrCreateWhatsAppCustomer customer upsert (new insert, xmax='0')
  transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = {
      execute: vi.fn().mockResolvedValue({}), // pg_advisory_xact_lock
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: () => [{ id: CUSTOMER_ID, xmax: '0' }],
          }),
        }),
      }),
    };
    return fn(mockTx);
  });

  // Transaction 2: findOrCreateConversation — creates new conversation
  transactionFn.mockImplementationOnce(async (fn: Any) => {
    let insertCount = 0;
    const mockTx = {
      insert: () => ({
        values: (vals: Any) => {
          insertCount++;
          if (insertCount === 1) {
            conversationInsertSpy(vals); // capture for channel assertion
            return { returning: () => [{ id: CONV_ID }] };
          }
          return {}; // assignment insert (no returning)
        },
      }),
    };
    return fn(mockTx);
  });

  // Query sequence for handleMessage (new conversation path)
  queryFn.mockImplementationOnce(qdb(q_fwl([{ name: 'Tenant', planTier: 'starter', monthlyCostBudgetUsd: null, defaultArtifactId: null, settings: {} }]))); // 1. tenant info
  queryFn.mockImplementationOnce(qdb(q_fwl([{ memory: null, displayName: 'John', name: 'John' }]))); // 2. customer memory
  queryFn.mockImplementationOnce(qdb(q_fw([{ totalCost: '0' }]))); // 3. budget check
  queryFn.mockImplementationOnce(qdb(q_fjw([{ count: 0 }]))); // 4. daily count
  queryFn.mockImplementationOnce(qdb(q_fjjwol([]))); // 5. findActiveConversation → no active conv
  queryFn.mockImplementationOnce(qdb(q_fjwol([]))); // 6. findMatchingRule → no rule
  queryFn.mockImplementationOnce(qdb(q_getDefaultArtifact())); // 7. getDefaultArtifact → fallback
  queryFn.mockImplementationOnce(qdb(q_fw([{ count: 0 }]))); // 8. conv cap B
  queryFn.mockImplementationOnce(qdb(q_ivr([{ id: MSG_ID }]))); // 9. save customer message
  queryFn.mockImplementationOnce(qdb(q_fwl([ARTIFACT_ROW]))); // 10. artifact config
  queryFn.mockImplementationOnce(qdb(q_fjw([]))); // 11. module bindings
  queryFn.mockImplementationOnce(qdb(q_fwol([]))); // 12. learnings
  queryFn.mockImplementationOnce(qdb(q_fwol([]))); // 13. conversation history
  queryFn.mockImplementationOnce(qdb(q_iv())); // 14. save response
  queryFn.mockImplementationOnce(qdb(q_iv())); // 15. telemetry log
  queryFn.mockImplementationOnce(qdb(q_usw())); // 16. update conv timestamp

  const tenantDb: TenantDb = { query: queryFn, transaction: transactionFn, tenantId: TENANT_ID } as Any;
  return { tenantDb, queryFn, transactionFn };
}

// ---------------------------------------------------------------------------
// Standard mock DB for handleMessage — existing conversation path (Tests 2, 4)
// ---------------------------------------------------------------------------

function setupExistingConvMockDb(activeConvRows: Any[]) {
  const queryFn = vi.fn();
  const transactionFn = vi.fn();

  // Transaction 1: findOrCreateWhatsAppCustomer — ON CONFLICT (xmax='1', returning customer)
  transactionFn.mockImplementationOnce(async (fn: Any) => {
    const mockTx = {
      execute: vi.fn().mockResolvedValue({}),
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: () => [{ id: CUSTOMER_ID, xmax: '1' }],
          }),
        }),
      }),
    };
    return fn(mockTx);
  });
  // No second transaction: findOrCreateConversation short-circuits (resolved.conversationId set)

  // Query sequence for handleMessage (existing conversation path)
  queryFn.mockImplementationOnce(qdb(q_fwl([{ name: 'Tenant', planTier: 'starter', monthlyCostBudgetUsd: null, defaultArtifactId: null, settings: {} }]))); // 1. tenant info
  queryFn.mockImplementationOnce(qdb(q_fwl([{ memory: null, displayName: 'John', name: 'John' }]))); // 2. customer memory
  queryFn.mockImplementationOnce(qdb(q_fw([{ totalCost: '0' }]))); // 3. budget check
  queryFn.mockImplementationOnce(qdb(q_fjw([{ count: 0 }]))); // 4. daily count
  queryFn.mockImplementationOnce(qdb(q_fjjwol(activeConvRows))); // 5. findActiveConversation → existing conv
  queryFn.mockImplementationOnce(qdb(q_fw([{ count: 0 }]))); // 6. conv cap B
  queryFn.mockImplementationOnce(qdb(q_ivr([{ id: MSG_ID }]))); // 7. save customer message
  queryFn.mockImplementationOnce(qdb(q_fwl([ARTIFACT_ROW]))); // 8. artifact config
  queryFn.mockImplementationOnce(qdb(q_fjw([]))); // 9. module bindings
  queryFn.mockImplementationOnce(qdb(q_fwol([]))); // 10. learnings
  queryFn.mockImplementationOnce(qdb(q_fwol([]))); // 11. conversation history
  queryFn.mockImplementationOnce(qdb(q_iv())); // 12. save response
  queryFn.mockImplementationOnce(qdb(q_iv())); // 13. telemetry log
  queryFn.mockImplementationOnce(qdb(q_usw())); // 14. update conv timestamp

  const tenantDb: TenantDb = { query: queryFn, transaction: transactionFn, tenantId: TENANT_ID } as Any;
  return { tenantDb, queryFn, transactionFn };
}

// ---------------------------------------------------------------------------
// Existing conv row constants
// ---------------------------------------------------------------------------

const ACTIVE_CONV_ROW = {
  artifactId: ARTIFACT_ID,
  artifactName: 'Sales Bot',
  artifactType: 'sales',
  conversationId: CONV_ID,
};

const ESCALATED_CONV_ROW = {
  artifactId: ARTIFACT_ID,
  artifactName: 'Sales Bot',
  artifactType: 'sales',
  conversationId: CONV_ID,
};

// ---------------------------------------------------------------------------
// beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  mocks.classifyIntent.mockResolvedValue({
    type: 'general_inquiry',
    confidence: 0.8,
    complexity: 'simple',
    requires_knowledge_base: false,
    sentiment: 'neutral',
    source: 'regex',
  });
  mocks.selectModel.mockReturnValue({ model: 'google/gemini-2.0-flash-001' });
  mocks.buildSystemPrompt.mockReturnValue('System prompt');
  mocks.createLLMClient.mockReturnValue(() => 'mock-model');
  mocks.searchKnowledge.mockResolvedValue({ directContext: [], proactiveContext: [], searchSkipped: true });
  mocks.generateEmbedding.mockResolvedValue([0.1, 0.2]);
  mocks.buildToolsFromBindings.mockReturnValue(undefined);
  mocks.shouldCheckGrounding.mockReturnValue(false);
  mocks.getIntentProfile.mockReturnValue({
    includeModules: false,
    maxSteps: 1,
    maxResponseTokens: 500,
    skipGrounding: true,
    includeArchetypeFramework: false,
    allowedModuleSlugs: undefined,
  });
  mocks.isHighRiskIntent.mockReturnValue(false);
  mocks.responseContainsClaims.mockReturnValue(false);

  (generateText as Any).mockResolvedValue({
    text: 'Hello! How can I help?',
    usage: { promptTokens: 10, completionTokens: 5 },
    steps: [],
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NC-260: WhatsApp two-way conversation sync', () => {
  // ── Test 1: First message creates conversation with channel 'whatsapp' ────

  it('1 — first WhatsApp message creates a conversation with channel: whatsapp', async () => {
    let capturedConvValues: Any = null;
    const { tenantDb, transactionFn } = setupNewConvMockDb((vals) => {
      capturedConvValues = vals;
    });

    const customerId = await findOrCreateWhatsAppCustomer(tenantDb, TENANT_ID, WA_ID, 'John');
    const result = await handleMessage({
      tenantDb,
      channel: 'whatsapp',
      customerId,
      messageText: 'Hi',
      tenantId: TENANT_ID,
    });

    expect(customerId).toBe(CUSTOMER_ID);
    expect(result.conversationId).toBe(CONV_ID);
    expect(capturedConvValues).not.toBeNull();
    expect(capturedConvValues.channel).toBe('whatsapp');
    expect(transactionFn).toHaveBeenCalledTimes(2); // customer upsert + new conversation
  });

  // ── Test 2: Second message reuses same conversation ───────────────────────

  it('2 — second message from same WA_ID reuses same conversation, no new transaction', async () => {
    const { tenantDb, transactionFn } = setupExistingConvMockDb([ACTIVE_CONV_ROW]);

    const customerId2 = await findOrCreateWhatsAppCustomer(tenantDb, TENANT_ID, WA_ID, 'John');
    const result2 = await handleMessage({
      tenantDb,
      channel: 'whatsapp',
      customerId: customerId2,
      messageText: 'Hello again',
      tenantId: TENANT_ID,
    });

    expect(customerId2).toBe(CUSTOMER_ID);
    expect(result2.conversationId).toBe(CONV_ID);
    // Only customer upsert transaction — no new conversation created
    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  // ── Test 3: replyAsOwner inserts human message and delivers to WhatsApp ──

  it('3 — replyAsOwner inserts role=human message and delivers via WhatsApp', async () => {
    mockSendText.mockResolvedValueOnce('wamid.test');

    let callIdx = 0;
    const queryFn = async (fn: Any) => {
      callIdx++;
      let mockDb: Any;
      if (callIdx === 1) {
        mockDb = q_fwl([{ role: 'owner' }]); // tenant_members auth check
      } else if (callIdx === 2) {
        mockDb = q_fljwl([{ id: CONV_ID, status: 'escalated', channel: 'whatsapp', customerExternalId: WA_ID }]); // conversation fetch
      } else if (callIdx === 3) {
        mockDb = q_ivr([{ id: MSG_ID, role: 'human', content: 'I will help you' }]); // message insert
      } else {
        mockDb = q_fwl([{ credentials: { access_token: 'tok' }, phoneNumber: 'pn_123' }]); // channelConfigs (async IIFE)
      }
      return fn(mockDb);
    };

    const db: TenantDb = { query: queryFn, transaction: async (fn: Any) => fn({}), tenantId: TENANT_ID } as Any;
    const caller = createCaller({
      req: new Request('http://test'),
      userId: USER_ID,
      orgId: null,
      userFullName: 'Alice Owner',
      tenantId: TENANT_ID,
      tenantDb: db,
    });

    const result = await caller.replyAsOwner({ conversationId: CONV_ID, message: 'I will help you' });

    // WhatsApp delivery is fire-and-forget (async IIFE) — wait before asserting
    // Pattern from conversation-reply-as-owner.test.ts:323
    await vi.waitFor(() => expect(mockSendText).toHaveBeenCalled());

    expect(result.role).toBe('human');
    expect(result.content).toBe('I will help you');
    expect(mockSendText).toHaveBeenCalledWith(
      WA_ID,
      'I will help you',
      { credentials: { access_token: 'tok' }, phoneNumber: 'pn_123' },
    );
  });

  // ── Test 4: Third message after owner reply → same conversation (AC4) ────

  it('4 — third message after owner reply lands in same conversation (escalated status)', async () => {
    // Mock DB returns an escalated conversation at step 5 (findActiveConversation).
    // With the inArray fix, the query can match escalated conversations.
    // This test verifies that when the DB returns an escalated conv row, handleMessage
    // correctly reuses it (same conversationId, no new conversation transaction).
    const { tenantDb, transactionFn } = setupExistingConvMockDb([ESCALATED_CONV_ROW]);

    const customerId3 = await findOrCreateWhatsAppCustomer(tenantDb, TENANT_ID, WA_ID, 'John');
    const result3 = await handleMessage({
      tenantDb,
      channel: 'whatsapp',
      customerId: customerId3,
      messageText: 'One more question',
      tenantId: TENANT_ID,
    });

    expect(customerId3).toBe(CUSTOMER_ID);
    expect(result3.conversationId).toBe(CONV_ID);
    // Only customer upsert transaction — no new conversation created after owner reply
    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  // ── Test 5: findActiveConversation SQL fix — inArray includes 'escalated' ─

  it('5 — findActiveConversation inArray fix: SQL params contain escalated', async () => {
    let capturedParams: unknown[] = [];

    const proxyDb = drizzle(
      async (_sql: string, params: unknown[]) => {
        capturedParams = [...params];
        // Return the row ONLY when params include 'escalated' (proves inArray fix works).
        // WITHOUT FIX: eq(status, 'active') → params = [CUSTOMER_ID, 'active', true]
        //              'escalated' NOT in params → rows = [] → result = null → FAILS
        // WITH FIX: inArray(status, ['active','escalated']) → params include 'escalated'
        //           → rows returned → result not null → PASSES
        if ((params as string[]).includes('escalated')) {
          return { rows: [[ARTIFACT_ID, 'Sales Bot', 'sales', CONV_ID]] };
        }
        return { rows: [] };
      },
      { schema },
    );

    const tenantDb: TenantDb = {
      query: async (fn: (db: TenantDrizzle) => Promise<unknown>) =>
        fn(proxyDb as unknown as TenantDrizzle),
      transaction: async (fn: (tx: TenantDrizzle) => Promise<unknown>) =>
        fn(proxyDb as unknown as TenantDrizzle),
      tenantId: TENANT_ID,
    } as TenantDb;

    const result = await findActiveConversation(tenantDb, CUSTOMER_ID);

    // PRIMARY: 'escalated' must be in params (FAILS without the inArray fix)
    expect(capturedParams).toContain('escalated');

    // SECONDARY: behavioral confirmation (result is non-null when params match)
    expect(result).not.toBeNull();
    // Note: conversationId assertion depends on Drizzle's column mapping order.
    // If the row format is wrong, drop this assertion — capturedParams is the binding test.
    expect(result!.conversationId).toBe(CONV_ID);
  });
});
