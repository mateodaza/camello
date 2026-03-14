import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockServicePoolQuery,
  mockExtractMetaMessage,
  mockFindOrCreateWhatsAppCustomer,
  mockNormalizeMetaMessage,
  mockHandleMessage,
  mockWhatsappSendText,
  mockMarkWebhookProcessed,
  mockCreateTenantDb,
} = vi.hoisted(() => ({
  mockServicePoolQuery: vi.fn(),
  mockExtractMetaMessage: vi.fn(),
  mockFindOrCreateWhatsAppCustomer: vi.fn(),
  mockNormalizeMetaMessage: vi.fn(),
  mockHandleMessage: vi.fn(),
  mockWhatsappSendText: vi.fn(),
  mockMarkWebhookProcessed: vi.fn(),
  mockCreateTenantDb: vi.fn().mockReturnValue({}),
}));

vi.mock('../lib/service-pool.js', () => ({
  servicePool: { query: mockServicePoolQuery },
}));
vi.mock('../adapters/whatsapp.js', () => ({
  extractMetaMessage: mockExtractMetaMessage,
  findOrCreateWhatsAppCustomer: mockFindOrCreateWhatsAppCustomer,
  normalizeMetaMessage: mockNormalizeMetaMessage,
  whatsappAdapter: { sendText: mockWhatsappSendText },
  markWebhookProcessed: mockMarkWebhookProcessed,
}));
vi.mock('../orchestration/message-handler.js', () => ({ handleMessage: mockHandleMessage }));
vi.mock('@camello/db', () => ({ createTenantDb: mockCreateTenantDb }));

import { internalRoutes } from '../routes/internal.js';

describe('internalRoutes POST /webhook-retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_RETRY_SECRET = 'test-secret';
  });

  async function post(body: unknown, secret?: string) {
    const req = new Request('http://localhost/webhook-retry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-internal-secret': secret } : {}),
      },
      body: JSON.stringify(body),
    });
    return internalRoutes.fetch(req);
  }

  it('returns 403 when x-internal-secret is missing', async () => {
    const res = await post({ webhookEventId: 'uuid-1' });
    expect(res.status).toBe(403);
    expect(mockServicePoolQuery).not.toHaveBeenCalled();
  });

  it('returns 403 when x-internal-secret is wrong', async () => {
    const res = await post({ webhookEventId: 'uuid-1' }, 'wrong-secret');
    expect(res.status).toBe(403);
  });

  it('returns 404 when event not found, already processed, wrong channel type, or tenant has no WhatsApp config', async () => {
    // 0 rows returned means: event missing, processed_at already set,
    // channel_type != 'whatsapp', or JOIN found no matching channel_configs row.
    // The JOIN on channel_configs.tenant_id ensures credentials always come from
    // the stored tenant — cross-tenant credential leak is structurally impossible.
    mockServicePoolQuery.mockResolvedValue({ rows: [] });
    const res = await post({ webhookEventId: 'uuid-2' }, 'test-secret');
    expect(res.status).toBe(404);
    expect(mockExtractMetaMessage).not.toHaveBeenCalled();
  });

  it('calls markWebhookProcessed and returns 200 on success', async () => {
    // credentials and phone_number come from channel_configs JOIN — tied to stored
    // tenant_id, not to a global phone-number-to-tenant re-resolution.
    mockServicePoolQuery.mockResolvedValue({
      rows: [{
        tenant_id: 't1',
        external_id: 'ext-1',
        payload: {},
        credentials: { access_token: 'tok' },
        phone_number: 'ph1',
      }],
    });
    mockExtractMetaMessage.mockReturnValue({
      phoneNumberId: 'ph1',
      message: { id: 'msg1' },
      contact: { waId: 'wa1', name: 'Alice' },
    });
    mockFindOrCreateWhatsAppCustomer.mockResolvedValue('cust-1');
    mockNormalizeMetaMessage.mockReturnValue({ content: { text: 'Hello' } });
    mockHandleMessage.mockResolvedValue({ responseText: 'Hi there' });
    mockWhatsappSendText.mockResolvedValue(undefined);
    mockMarkWebhookProcessed.mockResolvedValue(undefined);

    const res = await post({ webhookEventId: 'uuid-3' }, 'test-secret');
    expect(res.status).toBe(200);
    expect(mockMarkWebhookProcessed).toHaveBeenCalledWith('t1', 'ext-1');
    // Verify sendText uses credentials from the stored tenant's channel_config
    expect(mockWhatsappSendText).toHaveBeenCalledWith(
      'wa1',
      'Hi there',
      { credentials: { access_token: 'tok' }, phoneNumber: 'ph1' },
    );
  });
});
