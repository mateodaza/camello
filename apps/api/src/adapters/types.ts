import type { Channel, CanonicalMessage } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Channel adapter interface (per spec section 6)
// ---------------------------------------------------------------------------

/** Credentials + config for a channel, from the channel_configs table. */
export interface ChannelConfig {
  credentials: Record<string, unknown>;
  phoneNumber?: string;
  webhookUrl?: string;
}

export interface ChannelAdapter {
  readonly channel: Channel;

  /** Verify webhook authenticity (signature / challenge). Optional — webchat has no webhooks. */
  verifyWebhook?(req: Request): Promise<boolean>;

  /** Normalise an inbound payload into the canonical message format. */
  parseInbound(payload: unknown): CanonicalMessage;

  /** Send a plain text message to a channel recipient. Returns the channel-side message ID. */
  sendText(to: string, text: string, config: ChannelConfig): Promise<string>;

  /** Send an interactive message (buttons). Returns the channel-side message ID. */
  sendInteractive(
    to: string,
    text: string,
    buttons: Array<{ id: string; title: string }>,
    config: ChannelConfig,
  ): Promise<string>;

  /** Send a media message (image, document, audio). Returns the channel-side message ID. */
  sendMedia(
    to: string,
    mediaUrl: string,
    caption: string,
    config: ChannelConfig,
  ): Promise<string>;

  /** Mark a message as read (delivery receipt). Optional. */
  markRead?(messageId: string, config: ChannelConfig): Promise<void>;

  /** Send a typing indicator. Optional. */
  sendTypingIndicator?(to: string, config: ChannelConfig): Promise<void>;
}
