import { createClient } from '@supabase/supabase-js';

export type NewMessagePayload = {
  event: 'new_message';
  tenantId: string;
  conversationId: string;
  channel: 'whatsapp' | 'webchat';
  preview: string;
  at: string;
};

let _admin: ReturnType<typeof createClient> | null = null;

function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export async function broadcastNewMessage(
  tenantId: string,
  payload: NewMessagePayload,
): Promise<void> {
  const admin = getAdmin();
  if (!admin) return; // noop when env vars absent (dev/test)
  try {
    const ch = admin.channel(`tenant:${tenantId}`);
    await ch.send({ type: 'broadcast', event: 'new_message', payload });
    await admin.removeChannel(ch);
  } catch (err) {
    // Realtime broadcast is a non-critical side effect — never let it abort callers.
    console.error('[supabase-broadcast] broadcastNewMessage failed (non-blocking):', err);
  }
}
