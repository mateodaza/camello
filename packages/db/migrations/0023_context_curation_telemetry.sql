-- 0023: Add context_curation JSONB column to interaction_logs
-- Tracks intent profile decisions per generation: which tools were exposed,
-- whether archetype framework was included, token/step caps, grounding mode.
-- Nullable — backfill not needed; only new rows populate it.

ALTER TABLE interaction_logs
  ADD COLUMN context_curation jsonb;

COMMENT ON COLUMN interaction_logs.context_curation IS
  'Intent profile telemetry: profileKey, toolsExposed, frameworkIncluded, maxTokens, maxSteps, groundingMode, failClosedTriggered';

-- Post-check
DO $$
BEGIN
  ASSERT (
    SELECT COUNT(*) = 1
    FROM information_schema.columns
    WHERE table_name = 'interaction_logs' AND column_name = 'context_curation'
  ), 'context_curation column not found on interaction_logs';
END $$;
