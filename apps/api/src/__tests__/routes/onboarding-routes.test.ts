import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  provisionTenant: vi.fn(),
  generateObject: vi.fn(),
  createLLMClient: vi.fn(),
}));

vi.mock('../../services/tenant-provisioning.js', () => ({
  provisionTenant: mocks.provisionTenant,
}));

vi.mock('ai', () => ({
  generateObject: mocks.generateObject,
}));

vi.mock('@camello/ai', () => ({
  createLLMClient: mocks.createLLMClient,
}));

vi.mock('@camello/shared/constants', () => ({
  MODEL_MAP: { fast: 'openrouter/fast-model' },
  COST_BUDGET_DEFAULTS: { starter: 5.0, growth: 25.0, scale: 100.0 },
}));

// Mock the DB table references for Drizzle operations
vi.mock('@camello/db', () => ({
  artifacts: { id: 'artifacts.id', _table: 'artifacts' },
  artifactModules: { _table: 'artifactModules' },
  tenants: {
    id: 'tenants.id',
    settings: 'tenants.settings',
    name: 'tenants.name',
  },
  customers: {
    id: 'customers.id',
    tenantId: 'customers.tenantId',
    channel: 'customers.channel',
    externalId: 'customers.externalId',
  },
}));

import { createCallerFactory } from '../../trpc/init.js';
import { onboardingRouter, DEFAULT_SERVICES_SUGGESTION, BusinessModelSuggestionSchema } from '../../routes/onboarding.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID = 'user_test_123';
const ORG_ID = 'org_test_123';

const createCaller = createCallerFactory(onboardingRouter);

function mockTenantDb(queryImpl: (...args: Any[]) => Any): TenantDb {
  return { query: queryImpl, transaction: queryImpl } as Any;
}

function makeCtx(overrides: Partial<{ tenantDb: TenantDb; tenantId: string; userId: string; orgId: string | null }> = {}) {
  return {
    req: new Request('http://test'),
    userId: overrides.userId ?? USER_ID,
    orgId: overrides.orgId ?? ORG_ID,
    tenantId: overrides.tenantId ?? TENANT_ID,
    tenantDb: overrides.tenantDb ?? mockTenantDb(async () => []),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('onboarding router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createLLMClient.mockReturnValue(() => 'mock-model');
  });

  // ----- provision -----
  describe('provision', () => {
    it('calls provisionTenant with orgId and userId', async () => {
      mocks.provisionTenant.mockResolvedValue({
        tenantId: 'new-tenant-uuid',
        previewCustomerId: 'preview-cust-id',
        alreadyExisted: false,
      });

      const caller = createCaller(makeCtx());
      const result = await caller.provision({ orgId: ORG_ID, companyName: 'TestCo' });

      expect(result.tenantId).toBe('new-tenant-uuid');
      expect(result.alreadyExisted).toBe(false);
      expect(mocks.provisionTenant).toHaveBeenCalledWith({
        orgId: ORG_ID,
        orgName: 'TestCo',
        creatorUserId: USER_ID,
      });
    });

    it('returns alreadyExisted: true for re-provisioning', async () => {
      mocks.provisionTenant.mockResolvedValue({
        tenantId: 'existing-uuid',
        previewCustomerId: null,
        alreadyExisted: true,
      });

      const caller = createCaller(makeCtx());
      const result = await caller.provision({ orgId: ORG_ID, companyName: 'ExistingCo' });

      expect(result.alreadyExisted).toBe(true);
    });

    it('throws FORBIDDEN when orgId does not match session', async () => {
      const caller = createCaller(makeCtx({ orgId: 'org_different' }));

      await expect(
        caller.provision({ orgId: 'org_mismatch', companyName: 'Evil' }),
      ).rejects.toThrow(/Organization ID mismatch/);
    });

    it('throws FORBIDDEN when session has no orgId (null)', async () => {
      const caller = createCaller(makeCtx({ orgId: null }));

      await expect(
        caller.provision({ orgId: 'org_arbitrary', companyName: 'Sneaky' }),
      ).rejects.toThrow(/Organization ID mismatch/);
    });
  });

  // ----- parseBusinessModel -----
  describe('parseBusinessModel', () => {
    it('returns structured suggestion from LLM', async () => {
      const suggestion = {
        template: 'saas',
        agentName: 'Maya',
        agentType: 'sales',
        personality: {
          tone: 'professional',
          greeting: 'Hello! How can I help?',
          goals: ['Qualify leads', 'Book demos'],
        },
        constraints: {
          neverDiscuss: ['competitors'],
          alwaysEscalate: ['pricing questions'],
        },
        industry: 'software',
        confidence: 0.85,
      };

      mocks.generateObject.mockResolvedValue({ object: suggestion });

      const caller = createCaller(makeCtx());
      const result = await caller.parseBusinessModel({
        description: 'We sell project management software to small businesses',
      });

      expect(result).toEqual(suggestion);
      expect(mocks.generateObject).toHaveBeenCalledOnce();
    });

    it('returns default suggestion when LLM fails', async () => {
      mocks.generateObject.mockRejectedValue(new Error('LLM timeout'));

      const caller = createCaller(makeCtx());
      const result = await caller.parseBusinessModel({
        description: 'A bakery that sells custom cakes',
      });

      expect(result).toEqual(DEFAULT_SERVICES_SUGGESTION);
    });
  });

  // ----- setupArtifact -----
  describe('setupArtifact', () => {
    it('creates artifact + modules + sets defaultArtifactId atomically', async () => {
      const fakeArtifact = { id: 'artifact-uuid', name: 'Sales Bot', type: 'sales' };
      const insertedModules: Any[] = [];
      const updatedTenant: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        // First call: idempotency check — no existing default artifact
        if (callCount === 1) {
          const db = {
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          };
          return fn(db);
        }
        // Second call: transaction — create artifact + modules + update tenant
        const tx = {
          insert: vi.fn((table: Any) => {
            if (table?._table === 'artifactModules') {
              return {
                values: (vals: Any) => {
                  insertedModules.push(...(Array.isArray(vals) ? vals : [vals]));
                },
              };
            }
            // Default: artifacts table
            return {
              values: () => ({
                returning: () => [fakeArtifact],
              }),
            };
          }),
          update: vi.fn(() => ({
            set: (data: Any) => {
              updatedTenant.push(data);
              return { where: () => {} };
            },
          })),
        };
        return fn(tx);
      };
      const db = { query: queryImpl, transaction: queryImpl } as Any;

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.setupArtifact({
        name: 'Sales Bot',
        type: 'sales',
        moduleIds: ['00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000012'],
      });

      expect(result).toEqual(fakeArtifact);
      expect(insertedModules).toHaveLength(2);
      expect(insertedModules[0]).toMatchObject({
        artifactId: 'artifact-uuid',
        moduleId: '00000000-0000-0000-0000-000000000011',
        tenantId: TENANT_ID,
        autonomyLevel: 'draft_and_approve',
      });
      expect(updatedTenant[0]).toHaveProperty('defaultArtifactId', 'artifact-uuid');
    });

    it('skips module insertion when moduleIds is empty', async () => {
      const fakeArtifact = { id: 'art-no-mods', name: 'Support Bot', type: 'support' };
      let insertCallCount = 0;
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        // First call: idempotency check — no existing default artifact
        if (callCount === 1) {
          const db = {
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          };
          return fn(db);
        }
        const tx = {
          insert: vi.fn(() => {
            insertCallCount++;
            return {
              values: () => ({
                returning: () => [fakeArtifact],
              }),
            };
          }),
          update: vi.fn(() => ({
            set: () => ({ where: () => {} }),
          })),
        };
        return fn(tx);
      };
      const db = { query: queryImpl, transaction: queryImpl } as Any;

      const caller = createCaller(makeCtx({ tenantDb: db }));
      await caller.setupArtifact({
        name: 'Support Bot',
        type: 'support',
        moduleIds: [],
      });

      // Only 1 insert call (artifact), not 2 (artifact + modules)
      expect(insertCallCount).toBe(1);
    });
  });

  // ----- ensurePreviewCustomer -----
  describe('ensurePreviewCustomer', () => {
    it('returns customerId when INSERT succeeds', async () => {
      const db = mockTenantDb(async (fn: Any) => {
        const mockDb = {
          insert: () => ({
            values: () => ({
              onConflictDoNothing: () => ({
                returning: () => [{ id: 'new-customer-id' }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.ensurePreviewCustomer();

      expect(result.customerId).toBe('new-customer-id');
    });

    it('looks up existing customer when ON CONFLICT fires', async () => {
      let callCount = 0;
      const db = mockTenantDb(async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          // First call: insert returns empty (conflict)
          const mockDb = {
            insert: () => ({
              values: () => ({
                onConflictDoNothing: () => ({
                  returning: () => [],
                }),
              }),
            }),
          };
          return fn(mockDb);
        }
        // Second call: select finds existing
        const mockDb = {
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [{ id: 'existing-customer-id' }],
              }),
            }),
          }),
        };
        return fn(mockDb);
      });

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.ensurePreviewCustomer();

      expect(result.customerId).toBe('existing-customer-id');
    });
  });

  // ----- getStatus -----
  describe('getStatus', () => {
    it('returns settings and previewCustomerId', async () => {
      let callCount = 0;
      const db = mockTenantDb(async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          // tenant query
          return fn({
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => [{ settings: { onboardingStep: 3 }, name: 'TestCo' }],
                }),
              }),
            }),
          });
        }
        // customer query
        return fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [{ id: 'preview-cust-id' }],
              }),
            }),
          }),
        });
      });

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.getStatus();

      expect(result.settings).toEqual({ onboardingStep: 3 });
      expect(result.tenantName).toBe('TestCo');
      expect(result.previewCustomerId).toBe('preview-cust-id');
    });

    it('returns null previewCustomerId when no customer exists', async () => {
      let callCount = 0;
      const db = mockTenantDb(async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({
              from: () => ({
                where: () => ({
                  limit: () => [{ settings: {}, name: 'Empty' }],
                }),
              }),
            }),
          });
        }
        return fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => [],
              }),
            }),
          }),
        });
      });

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.getStatus();

      expect(result.previewCustomerId).toBeNull();
    });
  });

  // ----- saveStep -----
  describe('saveStep', () => {
    it('persists step number in JSONB settings', async () => {
      const setCalls: Any[] = [];
      const db = mockTenantDb(async (fn: Any) => {
        return fn({
          update: () => ({
            set: (data: Any) => {
              setCalls.push(data);
              return { where: () => {} };
            },
          }),
        });
      });

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.saveStep({ step: 3 });

      expect(result).toEqual({ ok: true });
      expect(setCalls).toHaveLength(1);
    });
  });

  // ----- complete -----
  describe('complete', () => {
    it('sets onboardingComplete in JSONB settings', async () => {
      const setCalls: Any[] = [];
      const db = mockTenantDb(async (fn: Any) => {
        return fn({
          update: () => ({
            set: (data: Any) => {
              setCalls.push(data);
              return { where: () => {} };
            },
          }),
        });
      });

      const caller = createCaller(makeCtx({ tenantDb: db }));
      const result = await caller.complete();

      expect(result).toEqual({ ok: true });
      expect(setCalls).toHaveLength(1);
    });
  });

  // ----- Schema validation -----
  describe('BusinessModelSuggestionSchema', () => {
    it('validates correct input', () => {
      const result = BusinessModelSuggestionSchema.safeParse(DEFAULT_SERVICES_SUGGESTION);
      expect(result.success).toBe(true);
    });

    it('rejects invalid template', () => {
      const result = BusinessModelSuggestionSchema.safeParse({
        ...DEFAULT_SERVICES_SUGGESTION,
        template: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('rejects confidence outside 0-1 range', () => {
      const result = BusinessModelSuggestionSchema.safeParse({
        ...DEFAULT_SERVICES_SUGGESTION,
        confidence: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });
});
