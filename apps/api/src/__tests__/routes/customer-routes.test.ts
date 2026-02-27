import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { customerRouter } from '../../routes/customer.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000010';

const createCaller = createCallerFactory(customerRouter);

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('customer router', () => {
  describe('byId', () => {
    it('returns customer with memory facts', async () => {
      const fakeCustomer = {
        id: CUSTOMER_ID,
        externalId: 'ext_123',
        channel: 'webchat',
        name: 'Carlos',
        email: 'carlos@test.com',
        phone: null,
        metadata: {},
        memory: {
          facts: [
            { key: 'name', value: 'Carlos', extractedAt: '2026-01-01', conversationId: 'c1' },
          ],
          updatedAt: '2026-01-01',
        },
        firstSeenAt: new Date('2026-01-01'),
        lastSeenAt: new Date('2026-01-15'),
      };

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [fakeCustomer],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.byId({ id: CUSTOMER_ID });

      expect(result).not.toBeNull();
      expect(result!.id).toBe(CUSTOMER_ID);
      expect(result!.name).toBe('Carlos');
      expect(result!.memory).toEqual(fakeCustomer.memory);
    });

    it('returns null for non-existent customer', async () => {
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
      const result = await caller.byId({ id: CUSTOMER_ID });
      expect(result).toBeNull();
    });
  });
});
