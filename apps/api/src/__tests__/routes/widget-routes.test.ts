import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available inside vi.mock factories
// (vi.mock calls are hoisted above imports by vitest)
// ---------------------------------------------------------------------------

const { mockDbExecute, mockTenantDbQuery, mockHandleMessage, mockGetQuickActions, mockDbSelectResult } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockTenantDbQuery: vi.fn(),
  mockHandleMessage: vi.fn(),
  mockGetQuickActions: vi.fn(),
  mockDbSelectResult: vi.fn(),
}));

vi.mock('@camello/db', () => ({
  db: {
    execute: mockDbExecute,
    select: () => ({ from: () => ({ where: mockDbSelectResult }) }),
  },
  createTenantDb: vi.fn(() => ({ query: mockTenantDbQuery, transaction: mockTenantDbQuery })),
  customers: {},
  conversations: {},
  messages: {},
  artifacts: {},
  tenants: {},
  artifactModules: {},
  modules: {},
}));

vi.mock('@camello/ai', () => ({
  getQuickActionsForModules: mockGetQuickActions,
}));

vi.mock('../../orchestration/message-handler.js', () => ({
  handleMessage: mockHandleMessage,
}));

vi.mock('../../lib/client-ip.js', () => ({
  extractClientIp: vi.fn(() => '1.2.3.4'),
}));

// Widget JWT — use real implementation with test secret
import { widgetRoutes } from '../../webhooks/widget.js';
import { createWidgetToken } from '../../lib/widget-jwt.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Any = any;

function post(path: string, body: unknown, headers?: Record<string, string>) {
  return widgetRoutes.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function get(path: string, headers?: Record<string, string>) {
  return widgetRoutes.request(path, { headers });
}

async function json(res: Response): Promise<Any> {
  return res.json();
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ARTIFACT_ID = '00000000-0000-0000-0000-000000000002';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000003';

async function makeToken(overrides?: Partial<{
  visitorId: string;
  tenantId: string;
  artifactId: string;
  customerId: string;
}>) {
  return createWidgetToken({
    visitorId: overrides?.visitorId ?? 'visitor_test',
    tenantId: overrides?.tenantId ?? TENANT_ID,
    artifactId: overrides?.artifactId ?? ARTIFACT_ID,
    customerId: overrides?.customerId ?? CUSTOMER_ID,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Widget routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WIDGET_JWT_SECRET', 'test-secret-key-at-least-32-chars-long!');
  });

  // -------------------------------------------------------------------------
  // GET /info
  // -------------------------------------------------------------------------
  describe('GET /info', () => {
    it('returns 400 when slug query param is missing', async () => {
      const res = await get('/info');
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Unable to load chat' });
    });

    it('returns 400 for invalid slug — same generic error as /session', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [] });
      const res = await get('/info?slug=nonexistent');
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Unable to load chat' });
    });

    it('returns 400 when tenant has no artifact', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce(undefined); // no artifact
      const res = await get('/info?slug=acme');
      expect(res.status).toBe(400);
    });

    it('returns tenant name, artifact name, greeting, and language for valid slug', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce({
        name: 'Sales Agent',
        personality: { language: 'es', greeting: 'Hola, bienvenido!' },
      });
      // tenantDb.query for tenant settings (profile)
      mockTenantDbQuery.mockResolvedValueOnce({ settings: null });
      // tenantDb.query for bound modules (artifactModules)
      mockTenantDbQuery.mockResolvedValueOnce([]);

      const res = await get('/info?slug=acme');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.tenant_name).toBe('Acme');
      expect(body.artifact_name).toBe('Sales Agent');
      expect(body.greeting).toBe('Hola, bienvenido!');
      expect(body.language).toBe('es');
    });

    it('returns profile data and empty quick_actions when no modules bound (no legacy fallback)', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce({
        name: 'Sales Agent',
        personality: {
          language: 'en',
          greeting: 'Hi!',
          // personality.quickActions exists but should be ignored (legacy fallback removed)
          quickActions: [
            { label: 'See menu', message: 'Show me the menu' },
            { label: 'Hours', message: 'What are your hours?' },
          ],
        },
      });
      // tenantDb.query for tenant settings
      mockTenantDbQuery.mockResolvedValueOnce({
        settings: {
          profile: {
            tagline: 'Best burgers in town',
            bio: 'Family-owned since 1985',
            avatarUrl: 'https://example.com/logo.png',
            socialLinks: [{ platform: 'twitter', url: 'https://twitter.com/acme' }],
            location: 'Bogotá, Colombia',
            hours: 'Mon-Fri 9am-6pm',
          },
        },
      });
      // tenantDb.query for bound modules — empty (no modules bound)
      mockTenantDbQuery.mockResolvedValueOnce([]);

      const res = await get('/info?slug=acme');
      expect(res.status).toBe(200);

      const body = await json(res);
      // Profile data still returned
      expect(body.profile).toBeDefined();
      expect(body.profile.tagline).toBe('Best burgers in town');
      expect(body.profile.bio).toBe('Family-owned since 1985');
      expect(body.profile.avatarUrl).toBe('https://example.com/logo.png');
      expect(body.profile.socialLinks).toHaveLength(1);
      expect(body.profile.location).toBe('Bogotá, Colombia');
      expect(body.profile.hours).toBe('Mon-Fri 9am-6pm');
      // No legacy fallback: personality.quickActions is ignored, result is empty
      expect(body.quick_actions).toEqual([]);
      // Module helper should NOT have been called (guard: empty bound modules)
      expect(mockGetQuickActions).not.toHaveBeenCalled();
    });

    it('defaults language to "en" and greeting to "" when personality is sparse', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce({
        name: 'Support Bot',
        personality: {},
      });
      // tenantDb.query for tenant settings
      mockTenantDbQuery.mockResolvedValueOnce({ settings: null });
      // tenantDb.query for bound modules
      mockTenantDbQuery.mockResolvedValueOnce([]);

      const res = await get('/info?slug=acme');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.language).toBe('en');
      expect(body.greeting).toBe('');
      expect(body.quick_actions).toEqual([]);
    });

    it('returns module-derived quick actions when modules are bound', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce({
        name: 'Sales Agent',
        personality: { language: 'en', greeting: 'Hello!' },
      });
      mockTenantDbQuery.mockResolvedValueOnce({ settings: null });
      // tenantDb.query for bound modules — 2 modules bound
      mockTenantDbQuery.mockResolvedValueOnce([
        { moduleId: 'mod-qualify' },
        { moduleId: 'mod-book' },
      ]);
      // db.select().from().where() for modules catalog
      mockDbSelectResult.mockResolvedValueOnce([
        { slug: 'qualify_lead' },
        { slug: 'book_meeting' },
      ]);
      // getQuickActionsForModules returns actions
      mockGetQuickActions.mockReturnValueOnce([
        { label: 'Tell me what you need', message: 'I need help choosing' },
        { label: 'Book a meeting', message: "I'd like to schedule a meeting" },
      ]);

      const res = await get('/info?slug=acme');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.quick_actions).toHaveLength(2);
      expect(body.quick_actions[0].label).toBe('Tell me what you need');
      expect(body.quick_actions[1].label).toBe('Book a meeting');
      expect(mockGetQuickActions).toHaveBeenCalledOnce();
    });

    it('returns empty quick actions for module-less artifact (support/custom)', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce({
        name: 'Support Bot',
        personality: { language: 'en', greeting: 'Need help?' },
      });
      mockTenantDbQuery.mockResolvedValueOnce({ settings: null });
      // tenantDb.query for bound modules — empty (no modules)
      mockTenantDbQuery.mockResolvedValueOnce([]);

      const res = await get('/info?slug=acme');
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.quick_actions).toEqual([]);
      // Guard: modules catalog query should NOT have been made
      expect(mockDbSelectResult).not.toHaveBeenCalled();
      expect(mockGetQuickActions).not.toHaveBeenCalled();
    });

    it('passes alphabetically sorted slugs for deterministic quick action order', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      mockTenantDbQuery.mockResolvedValueOnce({
        name: 'Marketing Bot',
        personality: { language: 'en', greeting: 'Welcome!' },
      });
      mockTenantDbQuery.mockResolvedValueOnce({ settings: null });
      mockTenantDbQuery.mockResolvedValueOnce([
        { moduleId: 'mod-1' },
        { moduleId: 'mod-2' },
      ]);
      // modules returned in arbitrary DB order (z before a)
      mockDbSelectResult.mockResolvedValueOnce([
        { slug: 'send_followup' },
        { slug: 'book_meeting' },
      ]);
      mockGetQuickActions.mockReturnValueOnce([
        { label: 'Book a meeting', message: 'Schedule' },
        { label: 'Request a follow-up', message: 'Follow up' },
      ]);

      const res = await get('/info?slug=acme');
      expect(res.status).toBe(200);

      // Verify slugs were sorted before being passed to the helper
      expect(mockGetQuickActions).toHaveBeenCalledWith(
        ['book_meeting', 'send_followup'], // alphabetical
        'en',
      );
    });

    it('returns 429 when rate limited', async () => {
      const slug = `info-rate-${Date.now()}`;

      for (let i = 0; i < 10; i++) {
        mockDbExecute.mockResolvedValueOnce({ rows: [] });
      }
      await Promise.all(
        Array.from({ length: 10 }, () => get(`/info?slug=${slug}`)),
      );

      const res = await get(`/info?slug=${slug}`);
      expect(res.status).toBe(429);
      expect(await json(res)).toEqual({ error: 'Too many requests' });
    });
  });

  // -------------------------------------------------------------------------
  // POST /session
  // -------------------------------------------------------------------------
  describe('POST /session', () => {
    it('returns 400 for missing fields', async () => {
      const res = await post('/session', {});
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Unable to create session' });
    });

    it('returns 400 (generic) for invalid slug — no tenant enumeration', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [] });

      const res = await post('/session', {
        tenant_slug: 'nonexistent',
        visitor_fingerprint: 'fp_abc',
      });
      expect(res.status).toBe(400);
      expect(await json(res)).toEqual({ error: 'Unable to create session' });
    });

    it('returns token + names + language for valid slug', async () => {
      // RPC → tenant found
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      // tenantDb.query → artifact lookup (with personality)
      mockTenantDbQuery.mockResolvedValueOnce({ name: 'Support Bot', personality: { language: 'es' } });
      // tenantDb.query → customer upsert
      mockTenantDbQuery.mockResolvedValueOnce(CUSTOMER_ID);
      // tenantDb.query → sessionInits fire-and-forget
      mockTenantDbQuery.mockResolvedValueOnce(undefined);

      const res = await post('/session', {
        tenant_slug: 'acme',
        visitor_fingerprint: 'fp_abc',
      });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.token).toBeDefined();
      expect(body.token.split('.').length).toBe(3); // JWT format
      expect(body.tenant_name).toBe('Acme');
      expect(body.artifact_name).toBe('Support Bot');
      expect(body.language).toBe('es');
    });

    it('defaults language to "en" when personality has no language field', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      // personality with no language
      mockTenantDbQuery.mockResolvedValueOnce({ name: 'Support Bot', personality: {} });
      mockTenantDbQuery.mockResolvedValueOnce(CUSTOMER_ID);
      // tenantDb.query → sessionInits fire-and-forget
      mockTenantDbQuery.mockResolvedValueOnce(undefined);
      // tenantDb.query → tenant settings (language fallback: no personality.language → check tenant preferredLocale)
      mockTenantDbQuery.mockResolvedValueOnce({ settings: null });

      const res = await post('/session', {
        tenant_slug: 'acme',
        visitor_fingerprint: 'fp_abc',
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.language).toBe('en');
    });

    it('returns 429 when rate limited (>10 req/min per IP+slug)', async () => {
      // Use unique slug to isolate from other tests
      const slug = `rate-test-${Date.now()}`;

      // Fire 10 requests (all will get 400 for bad slug, but they consume rate limit)
      for (let i = 0; i < 10; i++) {
        mockDbExecute.mockResolvedValueOnce({ rows: [] });
      }
      const promises = Array.from({ length: 10 }, () =>
        post('/session', { tenant_slug: slug, visitor_fingerprint: 'fp' }),
      );
      await Promise.all(promises);

      // 11th request → rate limited
      const res = await post('/session', {
        tenant_slug: slug,
        visitor_fingerprint: 'fp',
      });
      expect(res.status).toBe(429);
      expect(await json(res)).toEqual({ error: 'Too many requests' });
    });
  });

  // -------------------------------------------------------------------------
  // POST /message
  // -------------------------------------------------------------------------
  describe('POST /message', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await post('/message', { message: 'Hello' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid JWT', async () => {
      const res = await post('/message', { message: 'Hello' }, {
        Authorization: 'Bearer invalid.token.here',
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 for empty message', async () => {
      const token = await makeToken();
      const res = await post('/message', { message: '' }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for oversized message (>4000 chars)', async () => {
      const token = await makeToken();
      const res = await post('/message', { message: 'x'.repeat(4001) }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(400);
    });

    it('calls handleMessage and returns response for valid JWT + message', async () => {
      const token = await makeToken();
      mockHandleMessage.mockResolvedValueOnce({
        conversationId: '00000000-0000-0000-0000-000000000010',
        responseText: 'Hello there!',
        intent: 'greeting',
        modelUsed: 'gpt-4o-mini',
        latencyMs: 150,
      });

      const res = await post('/message', { message: 'Hello' }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.response_text).toBe('Hello there!');
      expect(body.conversation_id).toBe('00000000-0000-0000-0000-000000000010');
      expect(body.intent).toBe('greeting');
      expect(body.model_used).toBe('gpt-4o-mini');

      // Verify handleMessage was called with correct tenant context
      expect(mockHandleMessage).toHaveBeenCalledOnce();
      const args = mockHandleMessage.mock.calls[0][0];
      expect(args.tenantId).toBe(TENANT_ID);
      expect(args.customerId).toBe(CUSTOMER_ID);
      expect(args.channel).toBe('webchat');
      expect(args.messageText).toBe('Hello');
    });

    it('returns 403 when conversation_id belongs to another customer (spoofing)', async () => {
      const token = await makeToken({ customerId: CUSTOMER_ID });

      // tenantDb.query for ownership check → not found (different customer owns it)
      mockTenantDbQuery.mockResolvedValueOnce(null);

      const res = await post('/message', {
        message: 'Hello',
        conversation_id: '00000000-0000-0000-0000-000000000099',
      }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(403);
      expect(await json(res)).toEqual({ error: 'Forbidden' });
      expect(mockHandleMessage).not.toHaveBeenCalled();
    });

    it('returns 429 for burst rate limit (>20 msg/min per customer)', async () => {
      const customerId = `burst-${Date.now()}`;
      const token = await makeToken({ customerId });

      // Fire 20 requests — all will succeed or fail normally, consuming burst limit
      for (let i = 0; i < 20; i++) {
        mockHandleMessage.mockResolvedValueOnce({
          conversationId: '00000000-0000-0000-0000-000000000010',
          responseText: 'ok',
          intent: 'greeting',
          modelUsed: 'gpt-4o-mini',
          latencyMs: 50,
        });
      }
      await Promise.all(
        Array.from({ length: 20 }, () =>
          post('/message', { message: 'hi' }, { Authorization: `Bearer ${token}` }),
        ),
      );

      // 21st request → rate limited with error_code
      const res = await post('/message', { message: 'hi' }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(429);
      const body = await json(res);
      expect(body.error_code).toBe('RATE_LIMITED');
    });

    it('propagates conversation_limit_reached flag from handleMessage', async () => {
      const token = await makeToken();
      mockHandleMessage.mockResolvedValueOnce({
        conversationId: '00000000-0000-0000-0000-000000000010',
        responseText: 'Conversation limit reached',
        intent: 'general_inquiry',
        modelUsed: 'conversation_limit',
        latencyMs: 10,
        conversationLimitReached: true,
      });

      const res = await post('/message', { message: 'Hello' }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.conversation_limit_reached).toBe(true);
      expect(body.daily_limit_reached).toBe(false);
    });

    it('propagates daily_limit_reached flag from handleMessage', async () => {
      const token = await makeToken();
      mockHandleMessage.mockResolvedValueOnce({
        conversationId: '00000000-0000-0000-0000-000000000010',
        responseText: 'Daily limit reached',
        intent: 'general_inquiry',
        modelUsed: 'daily_limit',
        latencyMs: 10,
        dailyLimitReached: true,
      });

      const res = await post('/message', { message: 'Hello' }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.daily_limit_reached).toBe(true);
      expect(body.conversation_limit_reached).toBe(false);
    });

    it('uses verified conversation_id when ownership check passes', async () => {
      const token = await makeToken();
      const conversationId = '00000000-0000-0000-0000-000000000050';

      // tenantDb.query → ownership check passes
      mockTenantDbQuery.mockResolvedValueOnce({ id: conversationId });

      mockHandleMessage.mockResolvedValueOnce({
        conversationId,
        responseText: 'Continued',
        intent: 'general',
        modelUsed: 'gpt-4o-mini',
        latencyMs: 100,
      });

      const res = await post('/message', {
        message: 'Continue our chat',
        conversation_id: conversationId,
      }, {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);

      // handleMessage should receive the verified conversation ID
      const args = mockHandleMessage.mock.calls[0][0];
      expect(args.existingConversationId).toBe(conversationId);
    });
  });

  // -------------------------------------------------------------------------
  // GET /history
  // -------------------------------------------------------------------------
  describe('GET /history', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await get('/history');
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid JWT', async () => {
      const res = await get('/history', {
        Authorization: 'Bearer bad.token.value',
      });
      expect(res.status).toBe(401);
    });

    it('returns empty messages when no active conversation', async () => {
      const token = await makeToken();

      // tenantDb.query → no active conversation found
      mockTenantDbQuery.mockResolvedValueOnce(null);

      const res = await get('/history', {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.messages).toEqual([]);
      expect(body.conversation_id).toBeNull();
    });

    it('returns messages when conversation exists', async () => {
      const token = await makeToken();
      const conversationId = '00000000-0000-0000-0000-000000000060';

      // tenantDb.query → find active conversation
      mockTenantDbQuery.mockResolvedValueOnce({ id: conversationId });
      // tenantDb.query → fetch messages (returned in DESC order, code reverses)
      mockTenantDbQuery.mockResolvedValueOnce([
        { id: 'm2', role: 'artifact', content: 'Hi!', created_at: new Date('2025-01-02') },
        { id: 'm1', role: 'customer', content: 'Hello', created_at: new Date('2025-01-01') },
      ]);

      const res = await get('/history', {
        Authorization: `Bearer ${token}`,
      });
      expect(res.status).toBe(200);

      const body = await json(res);
      expect(body.conversation_id).toBe(conversationId);
      // Messages reversed from DESC → chronological (ASC)
      expect(body.messages.length).toBe(2);
      expect(body.messages[0].role).toBe('customer');
      expect(body.messages[1].role).toBe('artifact');
    });
  });
});
