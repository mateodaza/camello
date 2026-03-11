-- 0024: Add 'knowledge_gap' to owner_notifications type check constraint
--       and add UTC daily-bucket unique index for atomic concurrent deduplication (NC-236).

-- 1. Extend the CHECK constraint to allow the new notification type.
ALTER TABLE owner_notifications
  DROP CONSTRAINT owner_notifications_type_values;

ALTER TABLE owner_notifications
  ADD CONSTRAINT owner_notifications_type_values
  CHECK (type IN (
    'approval_needed', 'hot_lead', 'deal_closed', 'lead_stale', 'escalation',
    'budget_warning', 'stage_advanced', 'knowledge_gap'
  ));

-- 2. UTC daily-bucket partial unique index: enforces at most one knowledge_gap
--    notification per (artifact_id, intentType) per UTC calendar day.
--    Scoped to type = 'knowledge_gap' so it does not affect other notification types.
--
--    This index serves as the atomic concurrent safety net: application code
--    performs a SELECT-before-INSERT for the 24h rolling window check (spec-mandated),
--    and ON CONFLICT DO NOTHING relies on this index for the rare concurrent case.
--
--    Note: This index is defined here only — Drizzle schema DSL cannot express
--    partial unique indexes on expression columns (see notifications.ts comment).
--    ON CONFLICT DO NOTHING still respects it at runtime.
CREATE UNIQUE INDEX owner_notifications_knowledge_gap_daily_dedup
  ON owner_notifications (
    artifact_id,
    (metadata->>'intentType'),
    date_trunc('day', created_at AT TIME ZONE 'UTC')
  )
  WHERE type = 'knowledge_gap';

-- 3. Sanity assertions.
DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) = 1
    FROM pg_constraint
    WHERE conname = 'owner_notifications_type_values'
      AND contype = 'c'
  ), 'owner_notifications_type_values check constraint not found';

  ASSERT (
    SELECT COUNT(*) = 1
    FROM pg_indexes
    WHERE indexname = 'owner_notifications_knowledge_gap_daily_dedup'
  ), 'owner_notifications_knowledge_gap_daily_dedup index not found';
END $$;
