import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleBudgetExceeded,
  BUDGET_EXCEEDED_RESPONSE,
} from '../orchestration/message-handler.js';
import { createTrace } from '../lib/langfuse.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Any = any;

function makeMockTenantDb() {
  const queryFn = vi.fn();
  const transactionFn = vi.fn();
  return {
    db: { query: queryFn, transaction: transactionFn } as Any,
    queryFn,
    transactionFn,
  };
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000004';

function makeTrace() {
  return createTrace({ tenantId: TENANT_ID, artifactId: 'unknown', channel: 'webchat' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleBudgetExceeded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates conversation ownership before reuse', async () => {
    const { db, queryFn, transactionFn } = makeMockTenantDb();

    // 1st query: ownership check — returns null (not owned by this customer)
    queryFn.mockImplementationOnce(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => [],
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    // 2nd query: verify default artifact is active
    queryFn.mockImplementationOnce(async (fn: Any) => {
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

    // transaction: create new conversation (since ownership failed)
    transactionFn.mockImplementationOnce(async (fn: Any) => {
      const mockTx = {
        insert: () => ({
          values: () => ({
            returning: () => [{ id: 'new-conv-id' }],
          }),
        }),
      };
      return fn(mockTx);
    });

    // 3rd-5th queries: save messages, log telemetry, update conversation
    queryFn.mockImplementation(async (fn: Any) => {
      const mockDb = {
        insert: () => ({
          values: () => ({ returning: () => [{}] }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({}),
          }),
        }),
      };
      return fn(mockDb);
    });

    const result = await handleBudgetExceeded({
      tenantDb: db,
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'hello',
      existingConversationId: CONVERSATION_ID, // belongs to a DIFFERENT customer
      tenant: { name: 'Acme', defaultArtifactId: ARTIFACT_ID },
      trace: makeTrace(),
      startTime: Date.now(),
    });

    expect(result.budgetExceeded).toBe(true);
    // Should NOT reuse the existing conversation — creates a new one
    expect(result.conversationId).toBe('new-conv-id');
    expect(result.responseText).toBe(BUDGET_EXCEEDED_RESPONSE);
  });

  it('reuses conversation when ownership check passes', async () => {
    const { db, queryFn } = makeMockTenantDb();

    // 1st query: ownership check — passes (customer owns conversation)
    queryFn.mockImplementationOnce(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => [{ id: CONVERSATION_ID, artifactId: ARTIFACT_ID }],
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    // 2nd-4th queries: save messages, log telemetry, update conversation
    queryFn.mockImplementation(async (fn: Any) => {
      const mockDb = {
        insert: () => ({
          values: () => ({ returning: () => [{}] }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({}),
          }),
        }),
      };
      return fn(mockDb);
    });

    const result = await handleBudgetExceeded({
      tenantDb: db,
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'hello',
      existingConversationId: CONVERSATION_ID,
      tenant: { name: 'Acme', defaultArtifactId: ARTIFACT_ID },
      trace: makeTrace(),
      startTime: Date.now(),
    });

    expect(result.budgetExceeded).toBe(true);
    expect(result.conversationId).toBe(CONVERSATION_ID);
    expect(result.artifactId).toBe(ARTIFACT_ID);
  });

  it('returns controlled response without DB writes when no artifacts exist', async () => {
    const { db, queryFn, transactionFn } = makeMockTenantDb();

    // No existing conversation provided — skip ownership check

    // 1st query: verify default artifact active — not active
    queryFn.mockImplementationOnce(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => [],
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    // 2nd query: fallback first active artifact — none exist
    queryFn.mockImplementationOnce(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => [],
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const result = await handleBudgetExceeded({
      tenantDb: db,
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'hello',
      existingConversationId: undefined,
      tenant: { name: 'Acme', defaultArtifactId: ARTIFACT_ID }, // default exists but is inactive
      trace: makeTrace(),
      startTime: Date.now(),
    });

    expect(result.budgetExceeded).toBe(true);
    expect(result.conversationId).toBe('');
    expect(result.artifactId).toBe('');
    expect(result.responseText).toBe(BUDGET_EXCEEDED_RESPONSE);
    // No transaction calls — no FK-violating inserts
    expect(transactionFn).not.toHaveBeenCalled();
    // Only 2 queries (artifact checks), no message inserts
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('skips DB writes when tenant is undefined and no artifacts exist', async () => {
    const { db, queryFn, transactionFn } = makeMockTenantDb();

    // 1st query: fallback first active artifact — none
    queryFn.mockImplementationOnce(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => [],
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    const result = await handleBudgetExceeded({
      tenantDb: db,
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'hello',
      existingConversationId: undefined,
      tenant: undefined, // tenant not found
      trace: makeTrace(),
      startTime: Date.now(),
    });

    expect(result.budgetExceeded).toBe(true);
    expect(result.conversationId).toBe('');
    expect(result.artifactId).toBe('');
    expect(transactionFn).not.toHaveBeenCalled();
  });

  it('always sets budgetExceeded: true and modelUsed: budget_exceeded', async () => {
    const { db, queryFn } = makeMockTenantDb();

    // Ownership check — passes
    queryFn.mockImplementationOnce(async (fn: Any) => {
      const mockDb = {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => [{ id: CONVERSATION_ID, artifactId: ARTIFACT_ID }],
              }),
            }),
          }),
        }),
      };
      return fn(mockDb);
    });

    // Remaining queries: messages, telemetry, update
    queryFn.mockImplementation(async (fn: Any) => {
      const mockDb = {
        insert: () => ({
          values: () => ({ returning: () => [{}] }),
        }),
        update: () => ({
          set: () => ({
            where: () => ({}),
          }),
        }),
      };
      return fn(mockDb);
    });

    const result = await handleBudgetExceeded({
      tenantDb: db,
      tenantId: TENANT_ID,
      channel: 'webchat',
      customerId: CUSTOMER_ID,
      messageText: 'hello',
      existingConversationId: CONVERSATION_ID,
      tenant: { name: 'Acme', defaultArtifactId: ARTIFACT_ID },
      trace: makeTrace(),
      startTime: Date.now(),
    });

    expect(result.budgetExceeded).toBe(true);
    expect(result.modelUsed).toBe('budget_exceeded');
    expect(result.costUsd).toBe(0);
    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
    expect(result.intent.type).toBe('general_inquiry');
    expect(result.moduleExecutions).toEqual([]);
  });
});
