-- SECURITY DEFINER RPC to enumerate all tenants for webhook verification.
-- Bypasses RLS because the GET /webhook caller has no tenant context yet.
-- Returns ALL tenant IDs (not just those with channel_configs rows) so that
-- first-time setup works: the user sees their verify token before saving a
-- channel_configs row, registers it with Meta, and Meta's challenge must succeed
-- before any row exists.
-- SET search_path = public prevents search_path hijacking.

CREATE OR REPLACE FUNCTION public.get_whatsapp_tenant_ids()
RETURNS TABLE(tenant_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id AS tenant_id
  FROM public.tenants;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_tenant_ids() TO app_user;
