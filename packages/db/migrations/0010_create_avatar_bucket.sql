-- Migration: Create avatars storage bucket for tenant profile images
-- Bucket: 'avatars' (public, 2 MB limit)

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('avatars', 'avatars', true, 2097152)
ON CONFLICT (id) DO NOTHING;

-- Policy: Public read access (bucket is public for avatar display)
CREATE POLICY "Public read access for avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Policy: Service role manages uploads (tRPC uploadAvatar endpoint).
-- No authenticated write policies — all uploads go through the server-side
-- service role, preventing cross-tenant overwrites via direct Storage API.
CREATE POLICY "Service role can manage avatars"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'avatars');
