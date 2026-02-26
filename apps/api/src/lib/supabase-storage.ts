/**
 * Supabase Storage client singleton for file uploads (avatars, etc.).
 * Uses the service role key because uploads are performed server-side
 * on behalf of authenticated tenants (not directly by browser clients).
 */
import { createClient } from '@supabase/supabase-js';

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseStorageClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for storage');
  }

  _client = createClient(url, key);
  return _client;
}

const AVATARS_BUCKET = 'avatars';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Upload a tenant avatar to Supabase Storage.
 *
 * @param tenantId  The tenant UUID (used as folder prefix)
 * @param base64    The raw base64 file content (no data URI prefix)
 * @param contentType  MIME type (must be image/*)
 * @returns Public URL of the uploaded avatar
 */
export async function uploadAvatar(
  tenantId: string,
  base64: string,
  contentType: string,
): Promise<string> {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}. Allowed: ${[...ALLOWED_TYPES].join(', ')}`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(`File too large: ${buffer.length} bytes (max ${MAX_SIZE_BYTES})`);
  }

  const ext = EXT_MAP[contentType] ?? 'jpg';
  const path = `${tenantId}/avatar.${ext}`;

  const supabase = getSupabaseStorageClient();

  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true, // overwrite existing avatar
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(AVATARS_BUCKET)
    .getPublicUrl(path);

  return urlData.publicUrl;
}
