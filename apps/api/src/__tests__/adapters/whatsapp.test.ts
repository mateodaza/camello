import { describe, it, expect } from 'vitest';
import {
  verifyWhatsAppSignature,
  extractMetaMessage,
  normalizeMetaMessage,
} from '../../adapters/whatsapp.js';
import { createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignature(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function makeTextPayload(overrides?: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                phone_number_id: '123456789',
                display_phone_number: '+1234567890',
              },
              contacts: [
                { profile: { name: 'John Doe' }, wa_id: '5491155001234' },
              ],
              messages: [
                {
                  from: '5491155001234',
                  id: 'wamid.abc123',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'Hello from WhatsApp' },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe('WhatsApp signature verification', () => {
  const secret = 'my_app_secret';

  it('accepts a valid HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ test: true });
    const rawBody = new TextEncoder().encode(body);
    const sig = makeSignature(body, secret);

    expect(verifyWhatsAppSignature(rawBody, sig, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ test: true });
    const sig = makeSignature(body, secret);
    const tampered = new TextEncoder().encode(body + 'TAMPERED');

    expect(verifyWhatsAppSignature(tampered, sig, secret)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const body = new TextEncoder().encode('{}');
    expect(verifyWhatsAppSignature(body, null, secret)).toBe(false);
  });

  it('rejects an empty signature header', () => {
    const body = new TextEncoder().encode('{}');
    expect(verifyWhatsAppSignature(body, '', secret)).toBe(false);
  });

  it('rejects a signature with wrong secret', () => {
    const body = JSON.stringify({ test: true });
    const rawBody = new TextEncoder().encode(body);
    const wrongSig = makeSignature(body, 'wrong_secret');

    expect(verifyWhatsAppSignature(rawBody, wrongSig, secret)).toBe(false);
  });

  it('rejects a signature with wrong length (timingSafeEqual guard)', () => {
    const body = new TextEncoder().encode('{}');
    expect(verifyWhatsAppSignature(body, 'sha256=short', secret)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message extraction
// ---------------------------------------------------------------------------

describe('extractMetaMessage', () => {
  it('extracts a text message', () => {
    const payload = makeTextPayload();
    const result = extractMetaMessage(payload);

    expect(result).not.toBeNull();
    expect(result!.phoneNumberId).toBe('123456789');
    expect(result!.message.type).toBe('text');
    expect(result!.message.text?.body).toBe('Hello from WhatsApp');
    expect(result!.contact.waId).toBe('5491155001234');
    expect(result!.contact.name).toBe('John Doe');
  });

  it('returns null for status-only payloads', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '123', display_phone_number: '+1' },
                statuses: [
                  { id: 'wamid.abc', status: 'delivered', timestamp: '1700000000' },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(extractMetaMessage(payload)).toBeNull();
  });

  it('returns null for empty entry', () => {
    expect(extractMetaMessage({ object: 'whatsapp_business_account' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Message normalization
// ---------------------------------------------------------------------------

describe('normalizeMetaMessage', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const customerId = '00000000-0000-0000-0000-000000000002';
  const waId = '5491155001234';

  it('normalises a text message', () => {
    const msg = {
      from: waId,
      id: 'wamid.text001',
      timestamp: '1700000000',
      type: 'text',
      text: { body: 'Hello' },
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.channel).toBe('whatsapp');
    expect(result.direction).toBe('inbound');
    expect(result.tenant_id).toBe(tenantId);
    expect(result.customer_id).toBe(customerId);
    expect(result.channel_customer_id).toBe(waId);
    expect(result.content.type).toBe('text');
    expect(result.content.text).toBe('Hello');
    expect(result.metadata.channel_message_id).toBe('wamid.text001');
    expect(result.metadata.channel_timestamp).toBeInstanceOf(Date);
  });

  it('normalises an image message', () => {
    const msg = {
      from: waId,
      id: 'wamid.img001',
      timestamp: '1700000000',
      type: 'image',
      image: { id: 'media_id_123', mime_type: 'image/jpeg', caption: 'Look at this' },
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.content.type).toBe('image');
    expect(result.content.media_url).toBe('media_id_123');
    expect(result.content.mime_type).toBe('image/jpeg');
    expect(result.content.caption).toBe('Look at this');
  });

  it('normalises an audio message', () => {
    const msg = {
      from: waId,
      id: 'wamid.audio001',
      timestamp: '1700000000',
      type: 'audio',
      audio: { id: 'media_audio_123', mime_type: 'audio/ogg' },
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.content.type).toBe('audio');
    expect(result.content.media_url).toBe('media_audio_123');
  });

  it('normalises a document message', () => {
    const msg = {
      from: waId,
      id: 'wamid.doc001',
      timestamp: '1700000000',
      type: 'document',
      document: { id: 'media_doc_123', mime_type: 'application/pdf', caption: 'Invoice' },
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.content.type).toBe('document');
    expect(result.content.caption).toBe('Invoice');
  });

  it('normalises a location message', () => {
    const msg = {
      from: waId,
      id: 'wamid.loc001',
      timestamp: '1700000000',
      type: 'location',
      location: { latitude: -34.6037, longitude: -58.3816, name: 'Buenos Aires' },
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.content.type).toBe('location');
    expect(result.content.location).toEqual({ lat: -34.6037, lng: -58.3816 });
  });

  it('normalises an interactive button reply', () => {
    const msg = {
      from: waId,
      id: 'wamid.int001',
      timestamp: '1700000000',
      type: 'interactive',
      interactive: {
        type: 'button_reply',
        button_reply: { id: 'btn_yes', title: 'Yes' },
      },
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.content.type).toBe('interactive');
    expect(result.content.text).toBe('Yes');
    expect(result.content.buttons).toEqual([{ id: 'btn_yes', title: 'Yes' }]);
  });

  it('handles unknown message types gracefully', () => {
    const msg = {
      from: waId,
      id: 'wamid.unknown001',
      timestamp: '1700000000',
      type: 'sticker',
    };

    const result = normalizeMetaMessage(msg, tenantId, customerId, waId);

    expect(result.content.type).toBe('text');
    expect(result.content.text).toContain('Unsupported message type');
  });
});

// ---------------------------------------------------------------------------
// Webhook challenge (GET endpoint)
// ---------------------------------------------------------------------------

describe('WhatsApp webhook challenge', () => {
  // These test the Hono route logic inline since we can't easily import app here
  // without the full DB. The actual route tests are in the integration suite.
  // Here we test the core adapter logic that doesn't depend on DB.

  it('adapter channel is "whatsapp"', async () => {
    const { whatsappAdapter } = await import('../../adapters/whatsapp.js');
    expect(whatsappAdapter.channel).toBe('whatsapp');
  });
});
