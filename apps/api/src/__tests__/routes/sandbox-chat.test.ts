import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { chatRouter } from '../../routes/chat.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Mock handleMessage — prevent the full orchestration pipeline from running
// ---------------------------------------------------------------------------

const mockHandleMessage = vi.fn();
vi.mock('../../orchestration/message-handler.js', () => ({
  handleMessage: (...args: unknown[]) => mockHandleMessage(...args),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000010';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000020';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000030';

const createCaller = createCallerFactory(chatRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
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

/** Returns a tenantDb that resolves customer lookup to CUSTOMER_ID */
function dbWithCustomer() {
  return mockTenantDb(async (fn: Any) => {
    // The chat.send route does a `select({ id }).from(customers).where(...).limit(1)`
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [{ id: CUSTOMER_ID }],
          }),
        }),
      }),
    };
    return fn(mockDb);
  });
}

function defaultHandleResult(overrides: Record<string, Any> = {}) {
  return {
    conversationId: CONVERSATION_ID,
    artifactId: ARTIFACT_ID,
    responseText: 'Hello from sandbox!',
    intent: { type: 'general_inquiry', confidence: 0.9, complexity: 'simple', requires_knowledge_base: false, sentiment: 'neutral', source: 'regex' },
    modelUsed: 'google/gemini-2.0-flash-001',
    tokensIn: 10,
    tokensOut: 20,
    costUsd: 0.001,
    latencyMs: 100,
    moduleExecutions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('chat.send sandbox mode', () => {
  beforeEach(() => {
    mockHandleMessage.mockReset();
    mockHandleMessage.mockResolvedValue(defaultHandleResult());
  });

  it('succeeds with sandbox: true + valid artifactId', async () => {
    const caller = createCaller(makeCtx(dbWithCustomer()));

    const result = await caller.send({
      message: 'Hello',
      customerId: CUSTOMER_ID,
      sandbox: true,
      artifactId: ARTIFACT_ID,
    });

    expect(result.conversationId).toBe(CONVERSATION_ID);
    expect(result.responseText).toBe('Hello from sandbox!');

    // Verify handleMessage was called with override params
    expect(mockHandleMessage).toHaveBeenCalledOnce();
    const call = mockHandleMessage.mock.calls[0][0];
    expect(call.artifactId).toBe(ARTIFACT_ID);
    expect(call.conversationMetadata).toEqual({ sandbox: true });
  });

  it('rejects sandbox: true without artifactId (BAD_REQUEST)', async () => {
    const caller = createCaller(makeCtx(dbWithCustomer()));

    await expect(
      caller.send({
        message: 'Hello',
        customerId: CUSTOMER_ID,
        sandbox: true,
      }),
    ).rejects.toThrow();
  });

  it('rejects artifactId without sandbox: true (BAD_REQUEST)', async () => {
    const caller = createCaller(makeCtx(dbWithCustomer()));

    await expect(
      caller.send({
        message: 'Hello',
        customerId: CUSTOMER_ID,
        artifactId: ARTIFACT_ID,
      }),
    ).rejects.toThrow();
  });

  it('passes conversationId for continuation in sandbox mode', async () => {
    mockHandleMessage.mockResolvedValue(defaultHandleResult({ conversationId: CONVERSATION_ID }));
    const caller = createCaller(makeCtx(dbWithCustomer()));

    const result = await caller.send({
      message: 'Follow-up',
      customerId: CUSTOMER_ID,
      sandbox: true,
      artifactId: ARTIFACT_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(result.conversationId).toBe(CONVERSATION_ID);
    const call = mockHandleMessage.mock.calls[0][0];
    expect(call.existingConversationId).toBe(CONVERSATION_ID);
    expect(call.artifactId).toBe(ARTIFACT_ID);
    expect(call.conversationMetadata).toEqual({ sandbox: true });
  });

  it('does not pass artifactId/conversationMetadata in normal mode', async () => {
    const caller = createCaller(makeCtx(dbWithCustomer()));

    await caller.send({
      message: 'Normal message',
      customerId: CUSTOMER_ID,
    });

    const call = mockHandleMessage.mock.calls[0][0];
    expect(call.artifactId).toBeUndefined();
    expect(call.conversationMetadata).toBeUndefined();
  });
});
