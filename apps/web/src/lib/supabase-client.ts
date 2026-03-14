import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _browser: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (_browser) return _browser;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _browser = createClient(url, key);
  return _browser;
}
