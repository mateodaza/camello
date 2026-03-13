import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { channelRouter } from '../../routes/channel.js';
import type { TenantDb } from '@camello/db';

type Any = any;

const { mockVerifyPhoneNumberId } = vi.hoisted(() => ({
  mockVerifyPhoneNumberId: vi.fn(),
}));

vi.mock('../../adapters/whatsapp.js', () => ({
  verifyPhoneNumberId: mockVerifyPhoneNumberId,
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';

const createCaller = createCallerFactory(channelRouter);

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

describe('channel router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WA_VERIFY_TOKEN_SECRET', 'test-secret');
    vi.stubEnv('API_URL', 'https://api.example.com');
  });

  describe('verifyWhatsapp', () => {
    it('returns valid=true with displayPhoneNumber for correct credentials (mock Meta API)', async () => {
      mockVerifyPhoneNumberId.mockResolvedValue({ displayPhoneNumber: '+57 300 123 4567' });

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.verifyWhatsapp({ phoneNumberId: '123456789', accessToken: 'tok' });

      expect(result.valid).toBe(true);
      expect((result as Any).displayPhoneNumber).toBe('+57 300 123 4567');
      expect(mockVerifyPhoneNumberId).toHaveBeenCalledWith('123456789', 'tok');
    });

    it('returns valid=false when Meta API call fails', async () => {
      mockVerifyPhoneNumberId.mockResolvedValue(null);
      const updateMock = vi.fn();

      const db = mockTenantDb(async (fn: Any) => {
        return fn({ update: updateMock });
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.verifyWhatsapp({ phoneNumberId: 'bad', accessToken: 'bad' });

      expect(result.valid).toBe(false);
      expect((result as Any).error).toBeDefined();
      expect(updateMock).not.toHaveBeenCalled(); // DB not touched on failure
    });
  });

  describe('upsert', () => {
    it('stores phoneNumber and credentials', async () => {
      let capturedValues: Any = null;

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          insert: () => ({
            values: (vals: Any) => {
              capturedValues = vals;
              return {
                onConflictDoUpdate: () => ({
                  returning: () => [
                    {
                      id: 'c1',
                      channelType: 'whatsapp',
                      webhookUrl: null,
                      phoneNumber: '123456789',
                      isActive: true,
                      createdAt: new Date(),
                    },
                  ],
                }),
              };
            },
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      await caller.upsert({
        channelType: 'whatsapp',
        phoneNumber: '123456789',
        credentials: { access_token: 'tok' },
      });

      expect(capturedValues.phoneNumber).toBe('123456789');
      expect(capturedValues.credentials).toMatchObject({ access_token: 'tok' });
      expect(capturedValues.tenantId).toBe(TENANT_ID);
    });
  });

  describe('webhookConfig', () => {
    it('returns deterministic 32-char verifyToken and webhookUrl containing the webhook path', async () => {
      const db = mockTenantDb(async (fn: Any) => fn({}));
      const caller = createCaller(makeCtx(db));

      const result1 = await caller.webhookConfig();
      const result2 = await caller.webhookConfig();

      expect(result1.verifyToken).toBe(result2.verifyToken);
      expect(result1.verifyToken).toHaveLength(32);
      expect(result1.webhookUrl).toContain('/api/channels/whatsapp/webhook');
    });
  });
});
