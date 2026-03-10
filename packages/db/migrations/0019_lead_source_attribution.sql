ALTER TABLE leads ADD COLUMN source_channel text;
ALTER TABLE leads ADD COLUMN source_page    text;
CREATE INDEX idx_leads_source_channel ON leads(tenant_id, source_channel);
DO $$ BEGIN
  ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='leads' AND column_name='source_channel')),
    'source_channel column missing after migration';
END $$;
