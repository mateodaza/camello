'use client';

import { useEffect } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-client';

export type NewMessagePayload = {
  event: 'new_message';
  tenantId: string;
  conversationId: string;
  channel: 'whatsapp' | 'webchat';
  preview: string;
  at: string;
};

export function useRealtimeInbox(
  tenantId: string | null,
  onMessage: (payload: NewMessagePayload) => void,
) {
  useEffect(() => {
    if (!tenantId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return; // env vars absent — noop
    const channel = sb
      .channel(`tenant:${tenantId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) =>
        onMessage(payload as NewMessagePayload),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [tenantId, onMessage]);
}
