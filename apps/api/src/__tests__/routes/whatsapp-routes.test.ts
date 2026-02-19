import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures variables are available inside vi.mock factories
// (vi.mock calls are hoisted above imports by vitest)
// ---------------------------------------------------------------------------

const {
  mockVerifySignature,
  mockResolveTenant,
  mockFindOrCreateCustomer,
  mockInsertWebhookEvent,
  mockMarkWebhookProcessed,
  mockExtractMetaMessage,
  mockNormalizeMetaMessage,
  mockSendText,
  mockHandleMessage,
} = vi.hoisted(() => ({
  mockVerifySignature: vi.fn(),
  mockResolveTenant: vi.fn(),
  mockFindOrCreateCustomer: vi.fn(),
  mockInsertWebhookEvent: vi.fn(),
  mockMarkWebhookProcessed: vi.fn(),
  mockExtractMetaMessage: vi.fn(),
  mockNormalizeMetaMessage: vi.fn(),
  mockSendText: vi.fn(),
  mockHandleMessage: vi.fn(),
}));

vi.mock('../../adapters/whatsapp.js', () => ({
  verifyWhatsAppSignature: mockVerifySignature,
  resolveTenantByPhoneNumberId: mockResolveTenant,
  findOrCreateWhatsAppCustomer: mockFindOrCreateCustomer,
  insertWebhookEvent: mockInsertWebhookEvent,
  markWebhookProcessed: mockMarkWebhookProcessed,
  extractMetaMessage: mockExtractMetaMessage,
  normalizeMetaMessage: mockNormalizeMetaMessage,
  whatsappAdapter: { sendText: mockSendText, channel: 'whatsapp' },
}));

vi.mock('../../orchestration/message-handler.js', () => ({
  handleMessage: mockHandleMessage,
}));

vi.mock('@camello/db', () => ({
  createTenantDb: vi.fn(() => ({ query: vi.fn() })),
}));

import { whatsappRoutes } from '../../webhooks/whatsapp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const sampleMetaPayload = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '123',
    changes: [{
      value: {
        messaging_product: 'whatsapp',
        metadata: { phone_number_id: 'pn_123', display_phone_number: '+1234567890' },
        contacts: [{ profile: { name: 'John' }, wa_id: '5551234567' }],
        messages: [{
          from: '5551234567',
          id: 'wamid.abc123',
          timestamp: '1700000000',
          type: 'text',
          text: { body: 'Hello' },
        }],
      },
    }],
  }],
};

function postWebhook(body: unknown, headers?: Record<string, string>) {
  return whatsappRoutes.request('/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WhatsApp webhook routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WA_VERIFY_TOKEN', 'test-verify-token');
    vi.stubEnv('WA_APP_SECRET', 'test-app-secret');
  });

  // -------------------------------------------------------------------------
  // GET /webhook — Meta verification challenge
  // -------------------------------------------------------------------------
  describe('GET /webhook — challenge', () => {
    it('echoes challenge for correct verify_token', async () => {
      const res = await whatsappRoutes.request(
        '/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge_abc',
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('challenge_abc');
    });

    it('returns 403 for wrong verify_token', async () => {
      const res = await whatsappRoutes.request(
        '/webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge_abc',
      );
      expect(res.status).toBe(403);
    });

    it('returns 403 for wrong mode', async () => {
      const res = await whatsappRoutes.request(
        '/webhook?hub.mode=unsubscribe&hub.verify_token=test-verify-token&hub.challenge=challenge_abc',
      );
      expect(res.status).toBe(403);
    });

    it('returns 500 when WA_VERIFY_TOKEN not configured', async () => {
      vi.stubEnv('WA_VERIFY_TOKEN', '');
      const res = await whatsappRoutes.request(
        '/webhook?hub.mode=subscribe&hub.verify_token=anything&hub.challenge=test',
      );
      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /webhook — inbound messages
  // -------------------------------------------------------------------------
  describe('POST /webhook — inbound messages', () => {
    it('returns 401 for invalid signature', async () => {
      mockVerifySignature.mockReturnValue(false);

      const res = await postWebhook(sampleMetaPayload, {
        'x-hub-signature-256': 'sha256=invalid',
      });
      expect(res.status).toBe(401);
    });

    it('returns 200 silently when WA_APP_SECRET not configured', async () => {
      vi.stubEnv('WA_APP_SECRET', '');
      const res = await postWebhook(sampleMetaPayload);
      expect(res.status).toBe(200);
      // Signature verification should NOT be called
      expect(mockVerifySignature).not.toHaveBeenCalled();
    });

    it('returns 200 for status update (no message extracted)', async () => {
      mockVerifySignature.mockReturnValue(true);
      mockExtractMetaMessage.mockReturnValue(null); // status-only

      const res = await postWebhook({
        object: 'whatsapp_business_account',
        entry: [{ id: '123', changes: [{ value: { statuses: [{}] } }] }],
      });
      expect(res.status).toBe(200);
      expect(mockResolveTenant).not.toHaveBeenCalled();
    });

    it('returns 200 when phone_number_id is unknown (no tenant)', async () => {
      mockVerifySignature.mockReturnValue(true);
      mockExtractMetaMessage.mockReturnValue({
        phoneNumberId: 'unknown_pn',
        message: { from: '555', id: 'wamid.unk', timestamp: '1700000000', type: 'text' },
        contact: { name: 'X', waId: '555' },
      });
      mockResolveTenant.mockResolvedValue(null);

      const res = await postWebhook(sampleMetaPayload);
      expect(res.status).toBe(200);
      // Should not proceed to idempotency check
      expect(mockInsertWebhookEvent).not.toHaveBeenCalled();
    });

    it('returns 200 and skips duplicate messages (idempotency)', async () => {
      mockVerifySignature.mockReturnValue(true);
      mockExtractMetaMessage.mockReturnValue({
        phoneNumberId: 'pn_123',
        message: { from: '555', id: 'wamid.dup', timestamp: '1700000000', type: 'text', text: { body: 'Hi' } },
        contact: { name: 'John', waId: '555' },
      });
      mockResolveTenant.mockResolvedValue({
        tenantId: TENANT_ID,
        credentials: { access_token: 'tok' },
      });
      mockInsertWebhookEvent.mockResolvedValue(false); // duplicate

      const res = await postWebhook(sampleMetaPayload);
      expect(res.status).toBe(200);
      // handleMessage should NOT be called for duplicates
      expect(mockHandleMessage).not.toHaveBeenCalled();
    });

    it('returns 200 fast for new message and defers async processing', async () => {
      mockVerifySignature.mockReturnValue(true);
      mockExtractMetaMessage.mockReturnValue({
        phoneNumberId: 'pn_123',
        message: { from: '555', id: 'wamid.new1', timestamp: '1700000000', type: 'text', text: { body: 'Hello' } },
        contact: { name: 'John', waId: '555' },
      });
      mockResolveTenant.mockResolvedValue({
        tenantId: TENANT_ID,
        credentials: { access_token: 'tok' },
      });
      mockInsertWebhookEvent.mockResolvedValue(true); // new event

      const res = await postWebhook(sampleMetaPayload);

      // Response returned immediately (before async processing)
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('OK');

      // Async processing is deferred via setImmediate — not yet called
      // (handleMessage runs after the response is sent)
    });

    it('async path calls handleMessage and sends reply', async () => {
      mockVerifySignature.mockReturnValue(true);
      mockExtractMetaMessage.mockReturnValue({
        phoneNumberId: 'pn_123',
        message: { from: '555', id: 'wamid.async1', timestamp: '1700000000', type: 'text', text: { body: 'Hi' } },
        contact: { name: 'Jane', waId: '555' },
      });
      mockResolveTenant.mockResolvedValue({
        tenantId: TENANT_ID,
        credentials: { access_token: 'tok' },
      });
      mockInsertWebhookEvent.mockResolvedValue(true);
      mockFindOrCreateCustomer.mockResolvedValue('cust_123');
      mockNormalizeMetaMessage.mockReturnValue({
        id: 'msg_1',
        channel: 'whatsapp',
        direction: 'inbound',
        content: { type: 'text', text: 'Hi' },
      });
      mockHandleMessage.mockResolvedValue({
        conversationId: 'conv_1',
        responseText: 'Hello!',
        intent: 'greeting',
        modelUsed: 'gpt-4o-mini',
        latencyMs: 100,
      });
      mockSendText.mockResolvedValue('wamid.resp1');
      mockMarkWebhookProcessed.mockResolvedValue(undefined);

      await postWebhook(sampleMetaPayload);

      // Wait for setImmediate to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockFindOrCreateCustomer).toHaveBeenCalledWith(
        TENANT_ID, '555', 'Jane',
      );
      // handleMessage may be called more than once if a setImmediate leaks
      // from a prior test — check it was called with the right args
      expect(mockHandleMessage).toHaveBeenCalled();
      const hmCall = mockHandleMessage.mock.calls.find(
        (c: unknown[]) => (c[0] as { tenantId: string }).tenantId === TENANT_ID,
      );
      expect(hmCall).toBeDefined();
      expect(mockSendText).toHaveBeenCalledWith(
        '555', 'Hello!', { credentials: { access_token: 'tok' }, phoneNumber: 'pn_123' },
      );
      expect(mockMarkWebhookProcessed).toHaveBeenCalledWith(
        TENANT_ID, 'wamid.async1',
      );
    });

    it('async path catches errors without crashing', async () => {
      mockVerifySignature.mockReturnValue(true);
      mockExtractMetaMessage.mockReturnValue({
        phoneNumberId: 'pn_123',
        message: { from: '555', id: 'wamid.err1', timestamp: '1700000000', type: 'text', text: { body: 'X' } },
        contact: { name: 'Error', waId: '555' },
      });
      mockResolveTenant.mockResolvedValue({
        tenantId: TENANT_ID,
        credentials: { access_token: 'tok' },
      });
      mockInsertWebhookEvent.mockResolvedValue(true);
      // Simulate async processing error
      mockFindOrCreateCustomer.mockRejectedValue(new Error('DB error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await postWebhook(sampleMetaPayload);
      expect(res.status).toBe(200); // Response already sent

      // Wait for setImmediate to fire
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Error logged, not thrown
      expect(consoleSpy).toHaveBeenCalledWith(
        '[whatsapp] Async processing error:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});
