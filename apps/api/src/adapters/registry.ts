import type { Channel } from '@camello/shared/types';
import type { ChannelAdapter } from './types.js';
import { webchatAdapter } from './webchat.js';
import { whatsappAdapter } from './whatsapp.js';

// ---------------------------------------------------------------------------
// Channel adapter registry
// ---------------------------------------------------------------------------

const adapters: Partial<Record<Channel, ChannelAdapter>> = {
  webchat: webchatAdapter,
  whatsapp: whatsappAdapter,
};

/** Get the adapter for a channel. Throws if unsupported. */
export function getAdapter(channel: Channel): ChannelAdapter {
  const adapter = adapters[channel];
  if (!adapter) {
    throw new Error(`No adapter registered for channel "${channel}"`);
  }
  return adapter;
}

/** List all registered channel types. */
export function getRegisteredChannels(): Channel[] {
  return Object.keys(adapters) as Channel[];
}
