import { randomUUID } from 'node:crypto';
import type { CanonicalMessage } from '@camello/shared/types';
import type { ChannelAdapter } from './types.js';

// ---------------------------------------------------------------------------
// WebChat adapter
//
// WebChat is the simplest adapter: messages arrive via the widget HTTP routes
// (not webhooks), so there's no signature verification or async processing.
// Responses are returned directly in the HTTP response body.
// ---------------------------------------------------------------------------

export const webchatAdapter: ChannelAdapter = {
  channel: 'webchat',

  parseInbound(payload: unknown): CanonicalMessage {
    const p = payload as {
      tenantId: string;
      customerId: string;
      visitorId: string;
      text: string;
      conversationId?: string;
    };
    return {
      id: randomUUID(),
      channel: 'webchat',
      direction: 'inbound',
      tenant_id: p.tenantId,
      customer_id: p.customerId,
      channel_customer_id: p.visitorId,
      content: { type: 'text', text: p.text },
      metadata: {
        channel_message_id: randomUUID(),
        channel_timestamp: new Date(),
      },
      created_at: new Date(),
    };
  },

  async sendText(_to, _text, _config) {
    // WebChat responses are returned in the HTTP response body, not pushed.
    // This method exists to satisfy the interface; the message ID is synthetic.
    return `webchat_${randomUUID()}`;
  },

  async sendInteractive(_to, _text, _buttons, _config) {
    return `webchat_${randomUUID()}`;
  },

  async sendMedia(_to, _mediaUrl, _caption, _config) {
    return `webchat_${randomUUID()}`;
  },
};
