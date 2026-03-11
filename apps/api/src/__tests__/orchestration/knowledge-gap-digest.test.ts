import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports via vi.hoisted
// ---------------------------------------------------------------------------

const mockSendEmail = vi.hoisted(() => vi.fn());
const mockRenderBaseEmail = vi.hoisted(() => vi.fn());

vi.mock('../../lib/email.js', () => ({
  sendEmail: mockSendEmail,
  renderBaseEmail: mockRenderBaseEmail,
}));

// Mock all @camello/db imports. sendKnowledgeGapDigestEmail only calls
// db.select(), so table objects can be empty stubs.
vi.mock('@camello/db', () => ({
  artifacts: {},
  conversations: {},
  messages: {},
  conversationArtifactAssignments: {},
  artifactRoutingRules: {},
  tenants: {},
  learnings: {},
  interactionLogs: {},
  artifactModules: {},
  modules: {},
  moduleExecutions: {},
  leads: {},
  customers: {},
  ownerNotifications: {},
  createTenantDb: vi.fn(),
}));

vi.mock('@camello/ai', () => ({
  classifyIntent: vi.fn(),
  selectModel: vi.fn(),
  buildSystemPrompt: vi.fn(),
  createLLMClient: vi.fn(),
  createArtifactResolver: vi.fn(),
  searchKnowledge: vi.fn(),
  generateEmbedding: vi.fn(),
  buildToolsFromBindings: vi.fn(),
  checkGroundingWithRetry: vi.fn(),
  shouldCheckGrounding: vi.fn(),
  SAFE_FALLBACKS: {},
  getIntentProfile: vi.fn(),
  isHighRiskIntent: vi.fn(),
  responseContainsClaims: vi.fn(),
  flattenRagChunks: vi.fn(),
  parseMemoryFacts: vi.fn(() => []),
  mergeMemoryFacts: vi.fn(),
  parseMemoryTags: vi.fn(() => []),
  stripMemoryTags: vi.fn(),
  sanitizeFactValue: vi.fn(),
  MAX_INJECTED_FACTS: 10,
}));

vi.mock('@camello/shared/constants', () => ({
  COST_BUDGET_DEFAULTS: { starter: 5 },
  LEARNING_CONFIDENCE: { retrieval_floor: 0.5 },
}));

vi.mock('@camello/shared/messages', () => ({
  t: vi.fn(),
}));

vi.mock('../../lib/langfuse.js', () => ({
  buildTelemetry: vi.fn(),
  createTrace: vi.fn(),
}));

vi.mock('../../lib/date-utils.js', () => ({
  getUtcMonthWindow: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import {
  sendKnowledgeGapDigestEmail,
  _knowledgeGapDigestCooldownsForTest,
} from '../../orchestration/message-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Any = any;

const TENANT_ID = 'tenant-digest-001';
const OWNER_EMAIL = 'owner@digest-test.com';
const DASHBOARD_BASE = 'https://test.camello.xyz';

function makeGapRow(intentType: string, sampleQuestion: string) {
  return {
    id: `gap-${intentType}`,
    tenantId: TENANT_ID,
    artifactId: 'artifact-001',
    type: 'knowledge_gap' as const,
    title: `Knowledge gap: ${intentType}`,
    body: `Customer asked: "${sampleQuestion}"`,
    metadata: { intentType, sampleQuestion },
    readAt: null,
    createdAt: new Date('2026-03-11T10:00:00.000Z'),
    updatedAt: new Date('2026-03-11T10:00:00.000Z'),
  };
}

function makeTenantDb(gaps: Any[]) {
  return {
    query: vi.fn(async (fn: Any) => {
      // The query returns a chainable select object whose final result is the gaps array.
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => gaps,
            }),
          }),
        }),
      };
      return fn(db);
    }),
  } as Any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendKnowledgeGapDigestEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _knowledgeGapDigestCooldownsForTest.clear();
    mockRenderBaseEmail.mockReturnValue('<html>digest-email</html>');
    mockSendEmail.mockResolvedValue({ sent: true });
  });

  it('NC-237-4: sends email when no cooldown and gaps exist', async () => {
    const gaps = [
      makeGapRow('product_inquiry', 'What is the price?'),
      makeGapRow('return_policy', 'Can I return this?'),
    ];
    const tenantDb = makeTenantDb(gaps);

    await sendKnowledgeGapDigestEmail({
      tenantId: TENANT_ID,
      ownerEmail: OWNER_EMAIL,
      tenantDb,
      dashboardBaseUrl: DASHBOARD_BASE,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const callArgs = mockSendEmail.mock.calls[0][0];
    expect(callArgs.to).toBe(OWNER_EMAIL);
    expect(callArgs.subject).toContain('Knowledge gaps');
    expect(callArgs.subject).toContain('2');
    // renderBaseEmail should have been called with body containing both intentTypes and questions
    const renderCall = mockRenderBaseEmail.mock.calls[0][0];
    expect(renderCall.body).toContain('product_inquiry');
    expect(renderCall.body).toContain('What is the price?');
    expect(renderCall.body).toContain('return_policy');
    expect(renderCall.body).toContain('Can I return this?');
    // Cooldown should be set
    expect(_knowledgeGapDigestCooldownsForTest.has(TENANT_ID)).toBe(true);
  });

  it('NC-237-5: skips send when within 24h cooldown', async () => {
    // Pre-seed cooldown set 1 hour ago — still within 24h window
    _knowledgeGapDigestCooldownsForTest.set(TENANT_ID, Date.now() - 60 * 60 * 1000);

    const tenantDb = makeTenantDb([makeGapRow('product_inquiry', 'Test question?')]);

    await sendKnowledgeGapDigestEmail({
      tenantId: TENANT_ID,
      ownerEmail: OWNER_EMAIL,
      tenantDb,
      dashboardBaseUrl: DASHBOARD_BASE,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('NC-237-6: clears cooldown when DB returns 0 gaps', async () => {
    const tenantDb = makeTenantDb([]); // no gaps

    await sendKnowledgeGapDigestEmail({
      tenantId: TENANT_ID,
      ownerEmail: OWNER_EMAIL,
      tenantDb,
      dashboardBaseUrl: DASHBOARD_BASE,
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
    // Cooldown must be cleared so next call can retry
    expect(_knowledgeGapDigestCooldownsForTest.has(TENANT_ID)).toBe(false);
  });

  it('NC-237-7: clears cooldown when sendEmail returns { sent: false }', async () => {
    mockSendEmail.mockResolvedValue({ sent: false });
    const tenantDb = makeTenantDb([makeGapRow('product_inquiry', 'Test?')]);

    await sendKnowledgeGapDigestEmail({
      tenantId: TENANT_ID,
      ownerEmail: OWNER_EMAIL,
      tenantDb,
      dashboardBaseUrl: DASHBOARD_BASE,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    // Cooldown must be cleared on failed send
    expect(_knowledgeGapDigestCooldownsForTest.has(TENANT_ID)).toBe(false);
  });
});
