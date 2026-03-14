import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  provisionTenant: vi.fn(),
  generateObject: vi.fn(),
  createLLMClient: vi.fn(),
  applyArchetypeDefaults: vi.fn(),
}));

vi.mock('../../services/tenant-provisioning.js', () => ({
  provisionTenant: mocks.provisionTenant,
}));

vi.mock('../../lib/apply-archetype-defaults.js', () => ({
  applyArchetypeDefaults: mocks.applyArchetypeDefaults,
}));

vi.mock('ai', () => ({
  generateObject: mocks.generateObject,
}));

vi.mock('@camello/ai', () => ({
  createLLMClient: mocks.createLLMClient,
  ARCHETYPE_DEFAULT_TONES: {
    sales: { en: 'Confident, helpful, and solution-oriented', es: 'Seguro, servicial' },
    support: { en: 'Empathetic, patient, and thorough', es: 'Empático, paciente' },
    marketing: { en: 'Enthusiastic, casual, and engaging', es: 'Entusiasta, casual' },
    custom: { en: '', es: '' },
  },
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
        ownerEmail: null,
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

    it('overrides LLM agentType to sales even when LLM returns support', async () => {
      const llmSuggestion = {
        template: 'saas',
        agentName: 'Maya',
        agentType: 'support',
        personality: {
          tone: 'professional',
          greeting: 'Hello!',
          goals: ['Resolve issues'],
        },
        constraints: {
          neverDiscuss: [],
          alwaysEscalate: ['billing'],
        },
        industry: 'software',
        confidence: 0.7,
      };

      mocks.generateObject.mockResolvedValue({ object: llmSuggestion });

      const caller = createCaller(makeCtx());
      const result = await caller.parseBusinessModel({
        description: 'We provide IT support for small businesses',
      });

      // Must be 'sales' regardless of what LLM returned
      expect(result.agentType).toBe('sales');
    });
  });

  // ----- setupArtifact -----
  describe('setupArtifact', () => {
    it('creates artifact + calls applyArchetypeDefaults + sets defaultArtifactId', async () => {
      const fakeArtifact = { id: 'artifact-uuid', name: 'Sales Bot', type: 'sales' };
      const updatedTenant: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        // First call: idempotency check — no existing default artifact
        if (callCount === 1) {
          const db = {
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null, settings: {} }] }) }) }),
          };
          return fn(db);
        }
        // Second call: transaction — advisory lock + re-checks + create + update
        let selectCallCount = 0;
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => {
                  selectCallCount++;
                  // 1st select: re-check defaultArtifactId + settings (null = proceed)
                  if (selectCallCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                  // 2nd select: check existing by type (empty = no duplicate)
                  return [];
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            values: () => ({
              returning: () => [fakeArtifact],
            }),
          })),
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
      });

      expect(result).toEqual(fakeArtifact);
      // Module binding delegated to applyArchetypeDefaults
      expect(mocks.applyArchetypeDefaults).toHaveBeenCalledWith(
        expect.anything(), // tx
        'artifact-uuid',
        TENANT_ID,
        'sales',
      );
      expect(updatedTenant[0]).toHaveProperty('defaultArtifactId', 'artifact-uuid');
    });

    it('overrides non-sales input to sales when creating artifact', async () => {
      const fakeArtifact = { id: 'art-support', name: 'Support Bot', type: 'sales' };
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          const db = {
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null, settings: {} }] }) }) }),
          };
          return fn(db);
        }
        let selectCallCount = 0;
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => {
                  selectCallCount++;
                  if (selectCallCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                  return [];
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            values: () => ({
              returning: () => [fakeArtifact],
            }),
          })),
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
      });

      // applyArchetypeDefaults called with 'sales' regardless of input type
      expect(mocks.applyArchetypeDefaults).toHaveBeenCalledWith(
        expect.anything(),
        'art-support',
        TENANT_ID,
        'sales',
      );
    });

    it('profile merges into artifacts.personality on Path 4 (new artifact)', async () => {
      const fakeArtifact = { id: 'art-new', name: 'Sales Bot', type: 'sales', personality: {} };
      const updateCalls: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        if (callCount === 2) {
          let txSelectCount = 0;
          const tx = {
            execute: vi.fn().mockResolvedValue(undefined),
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn(() => {
                    txSelectCount++;
                    if (txSelectCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                    return [];
                  }),
                })),
              })),
            })),
            insert: vi.fn(() => ({ values: () => ({ returning: () => [fakeArtifact] }) })),
            update: vi.fn(() => ({
              set: (data: Any) => { updateCalls.push({ phase: 'tx', data }); return { where: () => {} }; },
            })),
          };
          return fn(tx);
        }
        // callCount === 3: Phase 2 profile merge UPDATE
        return fn({
          update: vi.fn(() => ({
            set: (data: Any) => { updateCalls.push({ phase: 'profile', data }); return { where: () => {} }; },
          })),
        });
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({
        name: 'Sales Bot',
        type: 'sales',
        profile: { tagline: 'We close deals', bio: 'Your sales assistant' },
      });

      const profileUpdate = updateCalls.find((c: Any) => c.phase === 'profile');
      expect(profileUpdate).toBeDefined();
      expect((result.personality as Any).tagline).toBe('We close deals');
      expect((result.personality as Any).bio).toBe('Your sales assistant');
    });

    it('profile merges into artifacts.personality on Path 1 (pre-tx fast-path)', async () => {
      const existingArtifact = {
        id: 'art-existing',
        name: 'Existing Bot',
        type: 'sales',
        personality: { tone: 'confident' },
      };
      const updateCalls: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: 'art-existing' }] }) }) }),
          });
        }
        if (callCount === 2) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [existingArtifact] }) }) }),
          });
        }
        // callCount === 3: Phase 2 profile merge UPDATE
        return fn({
          update: vi.fn(() => ({
            set: (data: Any) => { updateCalls.push(data); return { where: () => {} }; },
          })),
        });
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({
        name: 'Existing Bot',
        type: 'sales',
        profile: { tagline: 'Fast path tagline' },
      });

      expect(updateCalls).toHaveLength(1);
      expect(mocks.applyArchetypeDefaults).not.toHaveBeenCalled();
      expect((result.personality as Any).tagline).toBe('Fast path tagline');
      expect((result.personality as Any).tone).toBe('confident');
    });

    it('profile merges into artifacts.personality on Path 2 (in-tx race)', async () => {
      const raceArtifact = {
        id: 'art-race',
        name: 'Race Bot',
        type: 'sales',
        personality: { tone: 'friendly' },
      };
      const updateCalls: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        if (callCount === 2) {
          let txSelectCount = 0;
          const insertSpy = vi.fn(() => ({ values: () => ({ returning: () => [] }) }));
          const tx = {
            execute: vi.fn().mockResolvedValue(undefined),
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn(() => {
                    txSelectCount++;
                    if (txSelectCount === 1) return [{ defaultArtifactId: 'art-race', settings: {} }];
                    return [raceArtifact];
                  }),
                })),
              })),
            })),
            insert: insertSpy,
            update: vi.fn(() => ({
              set: (data: Any) => { updateCalls.push({ phase: 'tx', data }); return { where: () => {} }; },
            })),
          };
          return fn(tx);
        }
        // callCount === 3: Phase 2 profile merge UPDATE
        return fn({
          update: vi.fn(() => ({
            set: (data: Any) => { updateCalls.push({ phase: 'profile', data }); return { where: () => {} }; },
          })),
        });
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({
        name: 'Race Bot',
        type: 'sales',
        profile: { bio: 'Race path bio' },
      });

      const profileUpdate = updateCalls.find((c: Any) => c.phase === 'profile');
      expect(profileUpdate).toBeDefined();
      expect((result.personality as Any).bio).toBe('Race path bio');
      expect((result.personality as Any).tone).toBe('friendly');
      expect(result.id).toBe('art-race');
      expect(mocks.applyArchetypeDefaults).not.toHaveBeenCalled();
    });

    it('profile merges into artifacts.personality on Path 3 (existing-by-type adopt)', async () => {
      const existingByType = { id: 'art-by-type', name: 'Old Bot', type: 'support', personality: {} };
      const updateCalls: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        if (callCount === 2) {
          let txSelectCount = 0;
          const tx = {
            execute: vi.fn().mockResolvedValue(undefined),
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn(() => {
                    txSelectCount++;
                    if (txSelectCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                    return [existingByType];
                  }),
                })),
              })),
            })),
            insert: vi.fn(() => ({ values: () => ({ returning: () => [] }) })),
            update: vi.fn(() => ({
              set: (data: Any) => { updateCalls.push({ phase: 'tx', data }); return { where: () => {} }; },
            })),
          };
          return fn(tx);
        }
        // callCount === 3: Phase 2 profile merge UPDATE
        return fn({
          update: vi.fn(() => ({
            set: (data: Any) => { updateCalls.push({ phase: 'profile', data }); return { where: () => {} }; },
          })),
        });
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({
        name: 'Old Bot',
        type: 'support',
        profile: { bio: 'Adopted artifact bio' },
      });

      const profileUpdate = updateCalls.find((c: Any) => c.phase === 'profile');
      expect(profileUpdate).toBeDefined();
      expect((result.personality as Any).bio).toBe('Adopted artifact bio');
      expect(result.id).toBe('art-by-type');
    });

    it('no Phase 2 UPDATE issued when profile is omitted', async () => {
      const fakeArtifact = { id: 'art-noprofile', name: 'Bot', type: 'sales', personality: {} };
      let queryCallCount = 0;

      const queryImpl = async (fn: Any) => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        let txSelectCount = 0;
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => {
                  txSelectCount++;
                  if (txSelectCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                  return [];
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({ values: () => ({ returning: () => [fakeArtifact] }) })),
          update: vi.fn(() => ({ set: () => ({ where: () => {} }) })),
        };
        return fn(tx);
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      await caller.setupArtifact({ name: 'Bot', type: 'sales' });

      expect(queryCallCount).toBe(2);
    });

    it('no Phase 2 UPDATE when all profile fields are blank after trim', async () => {
      const fakeArtifact = { id: 'art-blank', name: 'Bot', type: 'sales', personality: {} };
      let queryCallCount = 0;

      const queryImpl = async (fn: Any) => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        let txSelectCount = 0;
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => {
                  txSelectCount++;
                  if (txSelectCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                  return [];
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({ values: () => ({ returning: () => [fakeArtifact] }) })),
          update: vi.fn(() => ({ set: () => ({ where: () => {} }) })),
        };
        return fn(tx);
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      await caller.setupArtifact({
        name: 'Bot',
        type: 'sales',
        profile: { tagline: '   ', bio: '' },
      });

      expect(queryCallCount).toBe(2);
    });

    it('overrides marketing input type to sales when creating artifact', async () => {
      const fakeArtifact = { id: 'art-mkt', name: 'Mkt Bot', type: 'sales' };
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null, settings: {} }] }) }) }),
          });
        }
        let selectCallCount = 0;
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => {
                  selectCallCount++;
                  if (selectCallCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                  return [];
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({ values: () => ({ returning: () => [fakeArtifact] }) })),
          update: vi.fn(() => ({ set: () => ({ where: () => {} }) })),
        };
        return fn(tx);
      };

      const caller = createCaller(
        makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }),
      );
      await caller.setupArtifact({ name: 'Mkt Bot', type: 'marketing' });

      // Despite 'marketing' input, archetype defaults applied as 'sales'
      expect(mocks.applyArchetypeDefaults).toHaveBeenCalledWith(
        expect.anything(),
        'art-mkt',
        TENANT_ID,
        'sales',
      );
    });

    it('Path 1 (pre-tx fast-path) overrides legacy non-sales artifact type to sales', async () => {
      const legacyArtifact = {
        id: 'art-legacy-support',
        name: 'Support Bot',
        type: 'support',
        personality: {},
      };
      const typeUpdateCalls: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: 'art-legacy-support' }] }) }) }),
          });
        }
        if (callCount === 2) {
          // fetch artifact by id
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [legacyArtifact] }) }) }),
          });
        }
        // callCount === 3: UPDATE to persist type = 'sales'
        return fn({
          update: vi.fn(() => ({
            set: (data: Any) => { typeUpdateCalls.push(data); return { where: () => {} }; },
          })),
        });
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({ name: 'Support Bot', type: 'support' });

      // Must be 'sales' even though the stored artifact has type 'support'
      expect(result.type).toBe('sales');
      expect(mocks.applyArchetypeDefaults).not.toHaveBeenCalled();
      // DB must be updated so downstream reads also get 'sales'
      expect(typeUpdateCalls).toHaveLength(1);
      expect(typeUpdateCalls[0]).toMatchObject({ type: 'sales' });
    });

    it('Path 2 (in-tx race) overrides legacy non-sales artifact type to sales', async () => {
      const legacyArtifact = {
        id: 'art-legacy-mkt',
        name: 'Mkt Bot',
        type: 'marketing',
        personality: {},
      };
      const txUpdateCalls: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          // Pre-tx check: no default yet
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        // callCount === 2: transaction — race: another request set defaultArtifactId inside tx
        let txSelectCount = 0;
        const tx = {
          execute: vi.fn().mockResolvedValue(undefined),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => {
                  txSelectCount++;
                  // 1st: re-check tenants — race winner already set defaultArtifactId
                  if (txSelectCount === 1) return [{ defaultArtifactId: 'art-legacy-mkt', settings: {} }];
                  // 2nd: fetch that artifact
                  return [legacyArtifact];
                }),
              })),
            })),
          })),
          insert: vi.fn(() => ({ values: () => ({ returning: () => [] }) })),
          update: vi.fn(() => ({
            set: (data: Any) => { txUpdateCalls.push(data); return { where: () => {} }; },
          })),
        };
        return fn(tx);
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({ name: 'Mkt Bot', type: 'marketing' });

      // Must be 'sales' even though the stored artifact has type 'marketing'
      expect(result.type).toBe('sales');
      expect(mocks.applyArchetypeDefaults).not.toHaveBeenCalled();
      // DB must be updated inside the transaction so downstream reads also get 'sales'
      expect(txUpdateCalls.some((c) => c.type === 'sales')).toBe(true);
    });

    it('profile.avatarUrl is included in personality patch', async () => {
      const fakeArtifact = { id: 'art-avatar', name: 'Bot', type: 'sales', personality: {} };
      const profileUpdateData: Any[] = [];
      let callCount = 0;

      const queryImpl = async (fn: Any) => {
        callCount++;
        if (callCount === 1) {
          return fn({
            select: () => ({ from: () => ({ where: () => ({ limit: () => [{ defaultArtifactId: null }] }) }) }),
          });
        }
        if (callCount === 2) {
          let txSelectCount = 0;
          const tx = {
            execute: vi.fn().mockResolvedValue(undefined),
            select: vi.fn(() => ({
              from: vi.fn(() => ({
                where: vi.fn(() => ({
                  limit: vi.fn(() => {
                    txSelectCount++;
                    if (txSelectCount === 1) return [{ defaultArtifactId: null, settings: {} }];
                    return [];
                  }),
                })),
              })),
            })),
            insert: vi.fn(() => ({ values: () => ({ returning: () => [fakeArtifact] }) })),
            update: vi.fn(() => ({ set: () => ({ where: () => {} }) })),
          };
          return fn(tx);
        }
        return fn({
          update: vi.fn(() => ({
            set: (data: Any) => { profileUpdateData.push(data); return { where: () => {} }; },
          })),
        });
      };

      const caller = createCaller(makeCtx({ tenantDb: { query: queryImpl, transaction: queryImpl } as Any }));
      const result = await caller.setupArtifact({
        name: 'Bot',
        type: 'sales',
        profile: { avatarUrl: 'https://cdn.example.com/logo.png' },
      });

      expect(profileUpdateData).toHaveLength(1);
      expect((result.personality as Any).avatarUrl).toBe('https://cdn.example.com/logo.png');
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
      let selectCount = 0;
      const db = mockTenantDb(async (fn: Any) => {
        return fn({
          update: () => ({
            set: (data: Any) => {
              setCalls.push(data);
              return { where: () => {} };
            },
          }),
          // complete() does 2 selects: tenant name + existing advisor check
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => {
                  selectCount++;
                  return selectCount === 1 ? [{ name: 'TestCo' }] : [];
                },
              }),
            }),
          }),
          insert: () => ({ values: () => {} }),
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
