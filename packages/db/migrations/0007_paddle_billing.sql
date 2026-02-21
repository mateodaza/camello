-- Migration 0007: Paddle Billing integration
-- - Rename billing_events.stripe_event_id → paddle_event_id
-- - Add Paddle subscription tracking columns to tenants
-- - Create paddle_webhook_events idempotency table (no RLS)
-- - SECURITY DEFINER RPC for webhook tenant resolution
-- - Index for reverse-lookup by subscription_id

-- 1) Rename stripe_event_id → paddle_event_id on billing_events
ALTER TABLE billing_events RENAME COLUMN stripe_event_id TO paddle_event_id;

-- 2) Add Paddle tracking columns to tenants
ALTER TABLE tenants
  ADD COLUMN paddle_subscription_id text,
  ADD COLUMN paddle_customer_id text,
  ADD COLUMN subscription_status text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled', 'paused', 'trialing')),
  ADD COLUMN paddle_status_raw text,
  ADD COLUMN paddle_updated_at timestamptz;

-- 3) Dedicated webhook idempotency table (decoupled from billing_events).
--    Checked BEFORE any business logic. tenant_id is nullable because
--    tenant resolution may not have happened yet for some event types.
--    processed_at is nullable: NULL = received but not yet processed.
--    failed_at marks terminal failures (poison events).
--    processing_started_at is the concurrency lock (stale after 60s).
CREATE TABLE paddle_webhook_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              text NOT NULL UNIQUE,
  event_type            text NOT NULL,
  tenant_id             uuid REFERENCES tenants(id) ON DELETE SET NULL,
  occurred_at           timestamptz NOT NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processed_at          timestamptz,
  failed_at             timestamptz,
  last_error            text,
  attempt_count         integer NOT NULL DEFAULT 0
);
-- NO RLS — operational/infra table, not tenant-scoped data.
-- Webhook handler runs as app_user without tenant context set.
-- Same rationale as `modules` table (global catalog, no RLS).
GRANT SELECT, INSERT, UPDATE ON paddle_webhook_events TO app_user;

-- 4) Index for webhook reverse-lookup (subscription_id → tenant)
CREATE INDEX idx_tenants_paddle_subscription
  ON tenants(paddle_subscription_id) WHERE paddle_subscription_id IS NOT NULL;

-- 5) SECURITY DEFINER RPC for webhook tenant resolution (bypasses RLS).
--    Same pattern as resolve_tenant_by_slug in migration 0003.
CREATE OR REPLACE FUNCTION resolve_tenant_by_paddle_subscription(p_sub_id text)
RETURNS TABLE (tenant_id uuid, plan_tier text, paddle_updated_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id AS tenant_id, plan_tier, paddle_updated_at
  FROM public.tenants
  WHERE paddle_subscription_id = p_sub_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_tenant_by_paddle_subscription(text) TO app_user;
