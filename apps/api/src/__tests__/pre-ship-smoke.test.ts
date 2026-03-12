import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock factories reference them
// ---------------------------------------------------------------------------

const mockSend = vi.hoisted(() => vi.fn());
const MockResend = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  }),
);
const mockGenerateObject = vi.hoisted(() => vi.fn());
const mockCreateLLMClient = vi.hoisted(() => vi.fn(() => () => 'mock-model'));

// ---------------------------------------------------------------------------
// vi.mock declarations (hoisted above all imports by Vitest)
// ---------------------------------------------------------------------------

// Mock the resend package directly so the real sendEmail / sendApprovalNotificationEmail
// functions can be tested without mocking lib/email.js itself.
vi.mock('resend', () => ({ Resend: MockResend }));

vi.mock('@camello/db', async () => {
  const schema = await vi.importActual<typeof import('@camello/db/schema')>('@camello/db/schema');
  return { ...schema, db: {}, pool: {}, createTenantDb: vi.fn() };
});

vi.mock('@camello/ai', () => ({
  classifyIntent: vi.fn(),
  selectModel: vi.fn(),
  buildSystemPrompt: vi.fn(),
  createLLMClient: mockCreateLLMClient,
  createArtifactResolver: vi.fn(),
  searchKnowledge: vi.fn(),
  generateEmbedding: vi.fn(),
  buildToolsFromBindings: vi.fn(),
  checkGroundingWithRetry: vi.fn(),
  shouldCheckGrounding: vi.fn(() => false),
  SAFE_FALLBACKS: {},
  getIntentProfile: vi.fn(),
  isHighRiskIntent: vi.fn(() => false),
  responseContainsClaims: vi.fn(() => false),
  flattenRagChunks: vi.fn(() => []),
  parseMemoryFacts: vi.fn(() => []),
  mergeMemoryFacts: vi.fn(),
  parseMemoryTags: vi.fn(() => []),
  stripMemoryTags: vi.fn((t: string) => t),
  sanitizeFactValue: vi.fn((v: string) => v),
  MAX_INJECTED_FACTS: 6,
  ARCHETYPE_DEFAULT_TONES: {
    sales: { en: 'Confident, helpful, and solution-oriented', es: 'Seguro, servicial' },
    support: { en: 'Empathetic, patient, and thorough', es: 'Empático, paciente' },
    marketing: { en: 'Enthusiastic, casual, and engaging', es: 'Entusiasta, casual' },
    custom: { en: '', es: '' },
  },
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
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

vi.mock('@camello/shared/constants', () => ({
  COST_BUDGET_DEFAULTS: { starter: 5, growth: 25, scale: 100 } as Record<string, number>,
  LEARNING_CONFIDENCE: { retrieval_floor: 0.5 },
  MODEL_MAP: { fast: 'openrouter/fast-model' },
}));

vi.mock('@camello/shared/messages', () => ({ t: vi.fn() }));

vi.mock('../lib/date-utils.js', () => ({
  getUtcMonthWindow: vi.fn(() => ({
    monthStart: new Date('2026-01-01'),
    nextMonthStart: new Date('2026-02-01'),
  })),
}));

vi.mock('../services/tenant-provisioning.js', () => ({
  provisionTenant: vi.fn(),
}));

vi.mock('../lib/apply-archetype-defaults.js', () => ({
  applyArchetypeDefaults: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (vi.mock calls above are hoisted before these)
// ---------------------------------------------------------------------------

import { sendEmail, _resetForTest } from '../lib/email.js';
import {
  sendApprovalNotificationEmail,
  _approvalEmailCooldownsForTest,
} from '../orchestration/message-handler.js';
import { recordKnowledgeGap } from '../orchestration/knowledge-gap.js';
import { createCallerFactory } from '../trpc/init.js';
import { onboardingRouter } from '../routes/onboarding.js';
import { artifactRouter } from '../routes/artifact.js';
import type { TenantDb } from '@camello/db';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const USER_ID = 'user_test_123';
const ORG_ID = 'org_test_123';

const createOnboardingCaller = createCallerFactory(onboardingRouter);
const createArtifactCaller = createCallerFactory(artifactRouter);

function makeOnboardingCaller() {
  return createOnboardingCaller({
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    tenantDb: { query: async () => [], transaction: async () => [] } as Any,
  });
}

function makeArtifactCtx(txMock: Any) {
  const wrappedQuery = async (cb: (tx: Any) => Any) => cb(txMock);
  const db = { query: wrappedQuery, transaction: wrappedQuery } as unknown as TenantDb;
  return {
    req: new Request('http://test'),
    userId: USER_ID,
    orgId: ORG_ID,
    tenantId: TENANT_ID,
    tenantDb: db,
  };
}

// ---------------------------------------------------------------------------
// Global beforeEach — reset all per-test state
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  _resetForTest();
  _approvalEmailCooldownsForTest.clear();
  delete process.env.RESEND_API_KEY;
});

// ---------------------------------------------------------------------------
// NC-232: parseBusinessModel agentType override
// ---------------------------------------------------------------------------

describe('NC-232: parseBusinessModel agentType override', () => {
  it('forces agentType to sales even when LLM returns support', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        template: 'saas',
        agentName: 'Maya',
        agentType: 'support',
        personality: { tone: 'empathetic', greeting: 'Hello!', goals: ['Resolve issues'] },
        constraints: { neverDiscuss: [], alwaysEscalate: [] },
        industry: 'software',
        confidence: 0.7,
      },
    });

    const caller = makeOnboardingCaller();
    const result = await caller.parseBusinessModel({
      description: 'We provide IT support for small businesses',
    });

    expect(result.agentType).toBe('sales');
  });
});

// ---------------------------------------------------------------------------
// NC-233: sendEmail noop when RESEND_API_KEY is absent
// ---------------------------------------------------------------------------

describe('NC-233: sendEmail noop when RESEND_API_KEY is absent', () => {
  it('returns {sent: false} and does not instantiate Resend', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'owner@test.com',
      subject: 'Test',
      html: '<p>Hi</p>',
    });

    expect(result.sent).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'));

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// NC-235: sendApprovalNotificationEmail hits Resend with correct subject
// ---------------------------------------------------------------------------

describe('NC-235: sendApprovalNotificationEmail hits Resend with correct subject', () => {
  it('calls Resend send with a subject containing the module name', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    await sendApprovalNotificationEmail({
      tenantId: TENANT_ID,
      ownerEmail: 'owner@test.com',
      moduleName: 'Book Meeting',
      moduleDescription: 'Books a meeting with this lead',
      customerName: 'Alice',
      inputSummary: '{"time":"10am"}',
      conversationId: 'conv-1',
      dashboardBaseUrl: 'https://test.camello.xyz',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Book Meeting'),
      }),
    );

    delete process.env.RESEND_API_KEY;
  });
});

// ---------------------------------------------------------------------------
// NC-236: recordKnowledgeGap inserts notification when RAG returns empty
// ---------------------------------------------------------------------------

describe('NC-236: recordKnowledgeGap inserts notification when SELECT is empty', () => {
  it('inserts a knowledge_gap notification and returns true', async () => {
    const insertedValues: Any[] = [];

    const mockDb = {
      select: () => ({ from: () => ({ where: () => [] }) }),
      insert: () => ({
        values: (v: Any) => {
          insertedValues.push(v);
          return {
            onConflictDoNothing: () => ({
              returning: () => [{ id: 'notif-id' }],
            }),
          };
        },
      }),
    };

    const tenantDb: TenantDb = {
      query: async (fn: Any) => fn(mockDb),
      transaction: async (fn: Any) => fn(mockDb),
    } as Any;

    const didInsert = await recordKnowledgeGap(
      tenantDb,
      TENANT_ID,
      ARTIFACT_ID,
      'product_inquiry',
      'What is your price?',
    );

    expect(didInsert).toBe(true);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ type: 'knowledge_gap' });
  });
});

// ---------------------------------------------------------------------------
// NC-239: artifact round-trip preserves widget config
// ---------------------------------------------------------------------------

describe('NC-239: artifact widget config round-trip', () => {
  it('update saves widgetPrimaryColor and widgetPosition to config', async () => {
    let capturedSet: Any = null;

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: Any) => {
          capturedSet = data;
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: ARTIFACT_ID, config: data.config }]),
            }),
          };
        }),
      }),
    };

    const caller = createArtifactCaller(makeArtifactCtx(txMock));

    await caller.update({
      id: ARTIFACT_ID,
      config: { widgetPrimaryColor: '#FF5722', widgetPosition: 'bottom-left' },
    });

    expect(capturedSet.config).toEqual({
      widgetPrimaryColor: '#FF5722',
      widgetPosition: 'bottom-left',
    });
  });

  it('byId returns stored widgetPrimaryColor and widgetPosition', async () => {
    const storedConfig = { widgetPrimaryColor: '#00897B', widgetPosition: 'bottom-right' };

    const txMock = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: ARTIFACT_ID,
              tenantId: TENANT_ID,
              name: 'Test Agent',
              type: 'sales',
              config: storedConfig,
              personality: {},
              constraints: {},
              escalation: {},
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }]),
          }),
        }),
      }),
    };

    const caller = createArtifactCaller(makeArtifactCtx(txMock));

    const result = await caller.byId({ id: ARTIFACT_ID });

    expect((result!.config as Record<string, unknown>).widgetPrimaryColor).toBe('#00897B');
    expect((result!.config as Record<string, unknown>).widgetPosition).toBe('bottom-right');
  });
});
