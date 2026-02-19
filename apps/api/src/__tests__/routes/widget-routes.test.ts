import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available inside vi.mock factories
// (vi.mock calls are hoisted above imports by vitest)
// ---------------------------------------------------------------------------

const { mockDbExecute, mockTenantDbQuery, mockHandleMessage } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockTenantDbQuery: vi.fn(),
  mockHandleMessage: vi.fn(),
}));

vi.mock('@camello/db', () => ({
  db: { execute: mockDbExecute },
  createTenantDb: vi.fn(() => ({ query: mockTenantDbQuery })),
  customers: {},
  conversations: {},
  messages: {},
  artifacts: {},
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

    it('returns token + names for valid slug', async () => {
      // RPC → tenant found
      mockDbExecute.mockResolvedValueOnce({
        rows: [{ id: TENANT_ID, name: 'Acme', default_artifact_id: ARTIFACT_ID }],
      });
      // tenantDb.query → artifact lookup
      mockTenantDbQuery.mockResolvedValueOnce({ name: 'Support Bot' });
      // tenantDb.query → customer upsert
      mockTenantDbQuery.mockResolvedValueOnce(CUSTOMER_ID);

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
