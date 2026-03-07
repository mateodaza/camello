-- Migration 0016: Owner Notifications channel
CREATE TABLE IF NOT EXISTS owner_notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id    UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  lead_id        UUID REFERENCES leads(id) ON DELETE SET NULL,
  type           TEXT NOT NULL CHECK (type IN (
    'approval_needed', 'hot_lead', 'deal_closed',
    'lead_stale', 'escalation', 'budget_warning'
  )),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  metadata       JSONB NOT NULL DEFAULT '{}',
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE owner_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_notifications_tenant_isolation ON owner_notifications
  FOR ALL USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON owner_notifications TO app_user;

-- Primary workspace query: unread first, then by date
CREATE INDEX idx_notifications_artifact_unread
  ON owner_notifications (artifact_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_artifact_all
  ON owner_notifications (artifact_id, created_at DESC);

-- Immutable helper for timestamptz -> UTC date (needed for expression indexes)
CREATE OR REPLACE FUNCTION utc_date(ts timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT (ts AT TIME ZONE 'UTC')::date;
$$;

-- Stale dedup: max 1 per (tenant, lead, calendar-day)
CREATE UNIQUE INDEX idx_notifications_stale_dedup
  ON owner_notifications (tenant_id, lead_id, utc_date(created_at))
  WHERE type = 'lead_stale' AND lead_id IS NOT NULL;

DO $$ BEGIN
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'owner_notifications'
  )), 'owner_notifications table missing';
END $$;
