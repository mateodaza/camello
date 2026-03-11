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

// Mock all @camello/db imports (message-handler has many transitive deps)
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
  sendApprovalNotificationEmail,
  _approvalEmailCooldownsForTest,
} from '../../orchestration/message-handler.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendApprovalNotificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _approvalEmailCooldownsForTest.clear();
    // Default renderBaseEmail implementation
    mockRenderBaseEmail.mockReturnValue('<html>mocked-email</html>');
    mockSendEmail.mockResolvedValue({ sent: true });
  });

  it('NC-235-1: sends email on happy path and sets cooldown', async () => {
    await sendApprovalNotificationEmail({
      tenantId: 'T1',
      ownerEmail: 'owner@test.com',
      moduleName: 'Book Meeting',
      moduleDescription: 'Books a meeting with this lead',
      customerName: 'Alice',
      inputSummary: '{"time":"10am"}',
      conversationId: 'conv-1',
      dashboardBaseUrl: 'https://test.camello.xyz',
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@test.com',
        subject: 'Action needed: Book Meeting approval',
      }),
    );
    // html should be whatever renderBaseEmail returned
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<html>mocked-email</html>' }),
    );
    // Cooldown should be set after successful send
    expect(_approvalEmailCooldownsForTest.has('T1')).toBe(true);
  });

  it('NC-235-2: rate-limits when cooldown is active', async () => {
    // Pre-seed: simulate a send that happened just now
    _approvalEmailCooldownsForTest.set('T1', Date.now());

    await sendApprovalNotificationEmail({
      tenantId: 'T1',
      ownerEmail: 'owner@test.com',
      moduleName: 'Book Meeting',
      moduleDescription: 'Books a meeting',
      customerName: 'Alice',
      inputSummary: '{}',
      conversationId: 'conv-2',
      dashboardBaseUrl: 'https://test.camello.xyz',
    });

    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('NC-235-3: clears cooldown when sendEmail returns sent: false', async () => {
    mockSendEmail.mockResolvedValue({ sent: false });

    await sendApprovalNotificationEmail({
      tenantId: 'T2',
      ownerEmail: 'owner@test.com',
      moduleName: 'Send Quote',
      moduleDescription: 'Sends a quote',
      customerName: 'Bob',
      inputSummary: '{"total":100}',
      conversationId: 'conv-3',
      dashboardBaseUrl: 'https://test.camello.xyz',
    });

    // The attempt was made
    expect(mockSendEmail).toHaveBeenCalled();
    // Cooldown cleared — allows retry
    expect(_approvalEmailCooldownsForTest.has('T2')).toBe(false);
  });

  it('NC-235-3b: clears cooldown when sendEmail throws (transport/API exception)', async () => {
    mockSendEmail.mockRejectedValue(new Error('Network error'));

    await expect(
      sendApprovalNotificationEmail({
        tenantId: 'T4',
        ownerEmail: 'owner@test.com',
        moduleName: 'Book Meeting',
        moduleDescription: 'Books a meeting',
        customerName: 'Carol',
        inputSummary: '{}',
        conversationId: 'conv-5',
        dashboardBaseUrl: 'https://test.camello.xyz',
      }),
    ).rejects.toThrow('Network error');

    // The attempt was made
    expect(mockSendEmail).toHaveBeenCalled();
    // Cooldown cleared — allows retry on next event
    expect(_approvalEmailCooldownsForTest.has('T4')).toBe(false);
  });

  it('NC-235-4: escapes user-controlled fields to prevent HTML injection', async () => {
    let capturedHtml = '';
    mockRenderBaseEmail.mockImplementation((opts: { body: string }) => {
      capturedHtml = opts.body;
      return `<html>${opts.body}</html>`;
    });

    await sendApprovalNotificationEmail({
      tenantId: 'T3',
      ownerEmail: 'owner@test.com',
      moduleName: 'Book Meeting',
      moduleDescription: 'Books a meeting',
      customerName: '<script>alert(1)</script>',
      inputSummary: '"><img src=x onerror=alert(1)>',
      conversationId: 'conv-4',
      dashboardBaseUrl: 'https://test.camello.xyz',
    });

    // Raw unescaped tags must not appear
    expect(capturedHtml).not.toContain('<script>');
    expect(capturedHtml).not.toContain('<img');
    // Escaped forms must appear
    expect(capturedHtml).toContain('&lt;script&gt;');
    expect(capturedHtml).toContain('&lt;img');
  });
});
