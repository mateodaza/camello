-- Add 'advisor' to knowledge_docs.source_type allowed values.
-- knowledge_docs has no prior CHECK constraint on source_type (verified: no migration
-- before 0028 adds one; schema uses .default('upload') only).
-- Drop defensively in case a future schema change adds one before this runs.
-- Include ALL known values so existing rows remain valid:
--   'upload' (default), 'url', 'website' (URL sync jobs), 'api', 'advisor' (new).
ALTER TABLE knowledge_docs DROP CONSTRAINT IF EXISTS knowledge_docs_source_type_check;
ALTER TABLE knowledge_docs ADD CONSTRAINT knowledge_docs_source_type_check
  CHECK (source_type IN ('upload', 'url', 'website', 'api', 'advisor'));
