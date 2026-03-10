-- Migration 0020: Unique index for queued send_followup executions per conversation
-- Provides the DB-level atomicity guarantee for auto-follow-up scheduling in qualify_lead.
--
-- Problem: qualify_lead checks for an existing queued follow-up before inserting one,
-- but check-then-insert is not atomic. Two concurrent qualify_lead executions for the
-- same conversation can both observe "no queued follow-up" and both attempt to insert,
-- causing duplicate follow-up processing.
--
-- Fix: Enforce at most one row with (conversation_id, module_slug='send_followup',
-- status='executed', output->>'followup_status'='queued') via a partial unique index.
-- The application layer uses ON CONFLICT DO NOTHING so the second concurrent insert
-- is silently discarded. When the cron processes the row and clears followup_status
-- (or changes status), the constraint is lifted and a new queued row can be inserted.

CREATE UNIQUE INDEX IF NOT EXISTS idx_module_executions_unique_queued_followup
  ON module_executions (conversation_id)
  WHERE module_slug = 'send_followup'
    AND status = 'executed'
    AND (output->>'followup_status') = 'queued';

-- Post-check
DO $$ BEGIN
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'module_executions'
      AND indexname = 'idx_module_executions_unique_queued_followup'
  )), 'idx_module_executions_unique_queued_followup missing';
END $$;
