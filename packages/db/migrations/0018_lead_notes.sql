-- lead_notes: owner and system notes attached to a lead
CREATE TABLE lead_notes (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid    NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  lead_id     uuid    NOT NULL REFERENCES leads(id)    ON DELETE CASCADE,
  author      text    NOT NULL CHECK (author IN ('owner', 'system')),
  content     text    NOT NULL CHECK (char_length(content) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead   ON lead_notes(lead_id,   created_at);
CREATE INDEX idx_lead_notes_tenant ON lead_notes(tenant_id, created_at);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_notes_tenant_isolation ON lead_notes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- lead_stage_changes: source-of-truth for ALL lead stage mutations
-- Populated by the DB trigger below; covers updateLeadStage (manual),
-- qualify-lead auto-progression (CAM-110), and any future code paths.
CREATE TABLE lead_stage_changes (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id     uuid    NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage  text    NOT NULL,
  to_stage    text    NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_stage_changes_lead   ON lead_stage_changes(lead_id,   created_at);
CREATE INDEX idx_lead_stage_changes_tenant ON lead_stage_changes(tenant_id, created_at);

ALTER TABLE lead_stage_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_stage_changes_tenant_isolation ON lead_stage_changes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Trigger: fires after any UPDATE to leads.stage, for every row.
-- Uses NEW.tenant_id so no application code needs to set it manually.
CREATE OR REPLACE FUNCTION log_lead_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO lead_stage_changes (tenant_id, lead_id, from_stage, to_stage)
    VALUES (NEW.tenant_id, NEW.id, OLD.stage, NEW.stage);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_stage_change
  AFTER UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION log_lead_stage_change();

GRANT SELECT, INSERT, UPDATE, DELETE ON lead_notes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_stage_changes TO app_user;

DO $$ BEGIN
  ASSERT (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'lead_notes')),
    'lead_notes table missing after migration';
  ASSERT (SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'lead_stage_changes')),
    'lead_stage_changes table missing after migration';
END $$;
