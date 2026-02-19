-- Migration 0004: Add columns for Trigger.dev background jobs
-- Supports: learning confidence decay, knowledge ingestion queue

-- 1. learnings: add archived_at + updated_at for decay job
ALTER TABLE learnings
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill updated_at for existing rows to their creation time
UPDATE learnings SET updated_at = created_at;

-- 2. knowledge_syncs: add ops columns for queue reliability
ALTER TABLE knowledge_syncs
  ADD COLUMN updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN attempt_count         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_error            TEXT,
  ADD COLUMN processing_started_at TIMESTAMPTZ;

-- 3. knowledge_syncs: status CHECK constraint
ALTER TABLE knowledge_syncs
  ADD CONSTRAINT knowledge_syncs_status_check
  CHECK (status IN ('pending', 'processing', 'synced', 'failed'));

-- 4. Partial index for SKIP LOCKED polling claim query
--    Covers: status = 'pending' (new work) and status = 'processing' (stale recovery)
--    Column order matches the WHERE + ORDER BY in the claim query
CREATE INDEX idx_knowledge_syncs_claim
  ON knowledge_syncs (status, processing_started_at, created_at)
  WHERE status IN ('pending', 'processing');
