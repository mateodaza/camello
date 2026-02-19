-- SECURITY DEFINER RPCs for pre-tenant-resolution bootstrap queries.
-- These bypass RLS because the caller doesn't know the tenant_id yet.
-- Each function is narrowly scoped to return only what's needed.
-- SET search_path = public prevents search_path hijacking.

-- 1. Resolve tenant by public slug (used by widget session endpoint)
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_slug(p_slug text)
RETURNS TABLE(id uuid, name text, default_artifact_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t.id, t.name, t.default_artifact_id
  FROM public.tenants t
  WHERE t.slug = p_slug
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_slug(text) TO app_user;

-- 2. Resolve channel config by phone number (used by WhatsApp webhook)
CREATE OR REPLACE FUNCTION public.resolve_channel_config_by_phone(
  p_channel_type text,
  p_phone_number text
)
RETURNS TABLE(tenant_id uuid, credentials jsonb)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cc.tenant_id, cc.credentials
  FROM public.channel_configs cc
  WHERE cc.channel_type = p_channel_type
    AND cc.phone_number = p_phone_number
    AND cc.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_channel_config_by_phone(text, text) TO app_user;
