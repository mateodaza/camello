import { describe, it, expect } from 'vitest';
import { createCallerFactory } from '../../trpc/init.js';
import { learningRouter } from '../../routes/learning.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const LEARNING_ID = '00000000-0000-0000-0000-000000000010';

const createCaller = createCallerFactory(learningRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(tenantDb: TenantDb) {
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    tenantId: TENANT_ID,
    tenantDb,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('learning router', () => {
  describe('list', () => {
    it('returns learnings for the tenant', async () => {
      const fakeRows = [
        { id: 'l1', content: 'Do not recommend plan X', confidence: '0.8' },
        { id: 'l2', content: 'Use formal tone', confidence: '0.6' },
      ];

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => fakeRows,
                }),
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.list({});

      expect(result).toEqual(fakeRows);
    });

    it('returns empty array when no learnings exist', async () => {
      const db = mockTenantDb(async (fn: Any) => {
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

      const caller = createCaller(makeCtx(db));
      const result = await caller.list({});

      expect(result).toEqual([]);
    });
  });

  describe('dismiss', () => {
    it('sets confidence to 0, archives, and writes audit log', async () => {
      const insertedValues: Any[] = [];

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => [{ id: LEARNING_ID, oldConfidence: '0.8' }],
              }),
            }),
          }),
          insert: () => ({
            values: (data: Any) => {
              insertedValues.push(data);
            },
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.dismiss({ learningId: LEARNING_ID });

      expect(result).toEqual({ id: LEARNING_ID });
      expect(insertedValues[0]).toMatchObject({
        tenantId: TENANT_ID,
        learningId: LEARNING_ID,
        action: 'dismissed',
        performedBy: USER_ID,
        oldConfidence: '0.8',
        newConfidence: '0',
      });
    });

    it('returns null when learning not found', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => [],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.dismiss({ learningId: LEARNING_ID });

      expect(result).toBeNull();
    });
  });

  describe('boost', () => {
    it('sets confidence to 1.0 and writes audit log', async () => {
      const insertedValues: Any[] = [];

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => [{ id: LEARNING_ID, oldConfidence: '0.5' }],
              }),
            }),
          }),
          insert: () => ({
            values: (data: Any) => {
              insertedValues.push(data);
            },
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.boost({ learningId: LEARNING_ID });

      expect(result).toEqual({ id: LEARNING_ID });
      expect(insertedValues[0]).toMatchObject({
        action: 'boosted',
        newConfidence: '1.0',
        oldConfidence: '0.5',
      });
    });

    it('returns null when learning not found', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => [],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.boost({ learningId: LEARNING_ID });

      expect(result).toBeNull();
    });
  });

  describe('bulkClearByModule', () => {
    it('archives all learnings for a module and writes audit logs', async () => {
      const insertedBatch: Any[] = [];
      const TARGETS = [
        { id: 'l1', oldConfidence: '0.7' },
        { id: 'l2', oldConfidence: '0.9' },
        { id: 'l3', oldConfidence: '0.5' },
      ];

      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => TARGETS,
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => {},
            }),
          }),
          insert: () => ({
            values: (data: Any) => {
              insertedBatch.push(...(Array.isArray(data) ? data : [data]));
            },
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.bulkClearByModule({ sourceModuleSlug: 'qualify_lead' });

      expect(result).toEqual({ clearedCount: 3 });
      expect(insertedBatch).toHaveLength(3);
      expect(insertedBatch.every((l: Any) => l.action === 'bulk_cleared')).toBe(true);
      expect(insertedBatch.every((l: Any) => l.newConfidence === '0')).toBe(true);
      expect(insertedBatch.map((l: Any) => l.learningId)).toEqual(['l1', 'l2', 'l3']);
    });

    it('returns clearedCount: 0 when no learnings match', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => [],
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx(db));
      const result = await caller.bulkClearByModule({ sourceModuleSlug: 'nonexistent' });

      expect(result).toEqual({ clearedCount: 0 });
    });
  });
});
