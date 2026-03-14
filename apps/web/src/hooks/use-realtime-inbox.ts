'use client';

import { useEffect, useRef } from 'react';
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
  // Stable ref so onMessage identity changes don't re-subscribe the channel.
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!tenantId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return; // env vars absent — noop
    const channel = sb
      .channel(`tenant:${tenantId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }: { payload: unknown }) =>
        onMessageRef.current(payload as NewMessagePayload),
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [tenantId]);
}
