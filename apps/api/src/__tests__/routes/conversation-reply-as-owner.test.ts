import { describe, it, expect, vi } from 'vitest';

const { mockSendText } = vi.hoisted(() => ({
  mockSendText: vi.fn(),
}));

vi.mock('../../adapters/whatsapp.js', () => ({
  whatsappAdapter: { sendText: mockSendText, channel: 'whatsapp' },
}));

vi.mock('../../lib/supabase-broadcast.js', () => ({
  broadcastNewMessage: vi.fn().mockResolvedValue(undefined),
}));

import { broadcastNewMessage } from '../../lib/supabase-broadcast.js';

import { createCallerFactory } from '../../trpc/init.js';
import { conversationRouter } from '../../routes/conversation.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const CONV_ID   = '00000000-0000-0000-0000-000000000011';
const USER_ID   = 'user_test_123';

const createCaller = createCallerFactory(conversationRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(
  tenantDb: TenantDb,
  overrides: { userFullName?: string | null } = {},
) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: null,
    userFullName: overrides.userFullName !== undefined ? overrides.userFullName : 'Alice Owner',
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// ---------------------------------------------------------------------------
// conversation.replyAsOwner
// ---------------------------------------------------------------------------

describe('conversation.replyAsOwner', () => {
  it('1 — happy path: escalated webchat, message inserted, no WhatsApp push', async () => {
    const msgRow = { id: 'msg-1', role: 'human', content: 'Hello!' };

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // tenant_members check
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          // conversation fetch
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [{ id: CONV_ID, status: 'escalated', channel: 'web_chat', customerExternalId: null }],
                }),
              }),
            }),
          };
        },
        insert: () => ({
          values: () => ({
            returning: () => [msgRow],
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    const result = await caller.replyAsOwner({ conversationId: CONV_ID, message: 'Hello!' });

    expect(result.role).toBe('human');
    expect(result.content).toBe('Hello!');
    expect(mockSendText).not.toHaveBeenCalled();
    expect(broadcastNewMessage).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ event: 'new_message', conversationId: CONV_ID }),
    );
  });

  it('2 — non-owner: FORBIDDEN when tenant_members returns no owner row', async () => {
    const db = mockTenantDb(async (fn: Any) => {
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

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.replyAsOwner({ conversationId: CONV_ID, message: 'Hi' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('3 — resolved: PRECONDITION_FAILED when status is resolved', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [{ id: CONV_ID, status: 'resolved', channel: 'web_chat', customerExternalId: null }],
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.replyAsOwner({ conversationId: CONV_ID, message: 'Hi' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('4 — insert fields: authorName from ctx.userFullName is written to metadata', async () => {
    let capturedValues: Any = null;

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [{ id: CONV_ID, status: 'escalated', channel: 'web_chat', customerExternalId: null }],
                }),
              }),
            }),
          };
        },
        insert: () => ({
          values: (vals: Any) => {
            capturedValues = vals;
            return {
              returning: () => [{ id: 'msg-2', ...vals }],
            };
          },
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db, { userFullName: 'Bob Builder' }));
    await caller.replyAsOwner({ conversationId: CONV_ID, message: 'Owner says hello' });

    expect(capturedValues).not.toBeNull();
    expect(capturedValues.role).toBe('human');
    expect(capturedValues.metadata.authorName).toBe('Bob Builder');
    expect(capturedValues.content).toBe('Owner says hello');
    expect(capturedValues.tenantId).toBe(TENANT_ID);
    expect(capturedValues.conversationId).toBe(CONV_ID);
  });

  it('5 — userFullName null: INTERNAL_SERVER_ERROR', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [{ id: CONV_ID, status: 'escalated', channel: 'web_chat', customerExternalId: null }],
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db, { userFullName: null }));
    await expect(
      caller.replyAsOwner({ conversationId: CONV_ID, message: 'Hi' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('6 — conversation NOT_FOUND: wrong ID returns NOT_FOUND', async () => {
    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          // Conversation query returns empty
          return {
            from: () => ({
              leftJoin: () => ({
                where: () => ({
                  limit: () => [],
                }),
              }),
            }),
          };
        },
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await expect(
      caller.replyAsOwner({ conversationId: CONV_ID, message: 'Hi' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('7 — WhatsApp fire-and-forget delivery', async () => {
    mockSendText.mockResolvedValueOnce('wamid.test');

    let callIndex = 0;
    const db = mockTenantDb(async (fn: Any) => {
      const mockDb = {
        select: () => {
          callIndex++;
          if (callIndex === 1) {
            // tenant_members
            return {
              from: () => ({
                where: () => ({
                  limit: () => [{ role: 'owner' }],
                }),
              }),
            };
          }
          if (callIndex === 2) {
            // conversation fetch (whatsapp)
            return {
              from: () => ({
                leftJoin: () => ({
                  where: () => ({
                    limit: () => [{ id: CONV_ID, status: 'escalated', channel: 'whatsapp', customerExternalId: '+1234567890' }],
                  }),
                }),
              }),
            };
          }
          // channelConfigs (async IIFE, call 4)
          return {
            from: () => ({
              where: () => ({
                limit: () => [{ credentials: { access_token: 'tok' }, phoneNumber: '12345' }],
              }),
            }),
          };
        },
        insert: () => ({
          values: () => ({
            returning: () => [{ id: 'msg-3', role: 'human', content: 'WhatsApp reply' }],
          }),
        }),
      };
      return fn(mockDb);
    });

    const caller = createCaller(makeCtx(db));
    await caller.replyAsOwner({ conversationId: CONV_ID, message: 'WhatsApp reply' });

    await vi.waitFor(() => expect(mockSendText).toHaveBeenCalled());

    expect(mockSendText).toHaveBeenCalledWith(
      '+1234567890',
      'WhatsApp reply',
      { credentials: { access_token: 'tok' }, phoneNumber: '12345' },
    );
  });
});
