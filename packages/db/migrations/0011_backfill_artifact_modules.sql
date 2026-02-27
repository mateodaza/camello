-- RELEASE GATE: Migration fails hard if any bindings are missing.
-- Deploy code removing fallback + quickActions validator ONLY after this migration succeeds.
-- Parts C and D must ship together — never split.

-- Backfill artifact_modules for legacy artifacts created before auto-binding (#64).
-- Archetype → module slug mapping:
--   sales    → qualify_lead, book_meeting
--   marketing → send_followup
--   support  → [] (no modules)
--   custom   → [] (no modules)

-- Step 0: Pre-check — Verify all required module slugs exist in the catalog.
-- Fails hard if any are missing (seed modules first).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'qualify_lead') THEN
    RAISE EXCEPTION 'Module qualify_lead not found in catalog — seed modules first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'book_meeting') THEN
    RAISE EXCEPTION 'Module book_meeting not found in catalog — seed modules first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM modules WHERE slug = 'send_followup') THEN
    RAISE EXCEPTION 'Module send_followup not found in catalog — seed modules first';
  END IF;
END $$;

-- Step 1: Backfill per (artifact, module) pair — safe for partially-bound artifacts.
-- Uses NOT EXISTS + ON CONFLICT DO NOTHING for double safety.

-- sales artifacts → qualify_lead + book_meeting
INSERT INTO artifact_modules (artifact_id, module_id, tenant_id, autonomy_level)
SELECT a.id, m.id, a.tenant_id, 'draft_and_approve'
FROM artifacts a
CROSS JOIN modules m
WHERE a.type = 'sales' AND m.slug IN ('qualify_lead', 'book_meeting')
  AND NOT EXISTS (
    SELECT 1 FROM artifact_modules am
    WHERE am.artifact_id = a.id AND am.module_id = m.id
  )
ON CONFLICT DO NOTHING;

-- marketing artifacts → send_followup
INSERT INTO artifact_modules (artifact_id, module_id, tenant_id, autonomy_level)
SELECT a.id, m.id, a.tenant_id, 'draft_and_approve'
FROM artifacts a
CROSS JOIN modules m
WHERE a.type = 'marketing' AND m.slug = 'send_followup'
  AND NOT EXISTS (
    SELECT 1 FROM artifact_modules am
    WHERE am.artifact_id = a.id AND am.module_id = m.id
  )
ON CONFLICT DO NOTHING;

-- Step 2: Post-check — Count remaining missing bindings.
-- RAISE EXCEPTION aborts the migration transaction if any gaps remain.
DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT count(*) INTO missing_count
  FROM (
    -- sales artifacts missing qualify_lead
    SELECT a.id FROM artifacts a
    WHERE a.type = 'sales'
      AND NOT EXISTS (
        SELECT 1 FROM artifact_modules am JOIN modules m ON m.id = am.module_id
        WHERE am.artifact_id = a.id AND m.slug = 'qualify_lead'
      )
    UNION ALL
    -- sales artifacts missing book_meeting
    SELECT a.id FROM artifacts a
    WHERE a.type = 'sales'
      AND NOT EXISTS (
        SELECT 1 FROM artifact_modules am JOIN modules m ON m.id = am.module_id
        WHERE am.artifact_id = a.id AND m.slug = 'book_meeting'
      )
    UNION ALL
    -- marketing artifacts missing send_followup
    SELECT a.id FROM artifacts a
    WHERE a.type = 'marketing'
      AND NOT EXISTS (
        SELECT 1 FROM artifact_modules am JOIN modules m ON m.id = am.module_id
        WHERE am.artifact_id = a.id AND m.slug = 'send_followup'
      )
  ) gaps;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'Post-backfill FAILED: % artifact/module bindings still missing — do NOT deploy fallback removal', missing_count;
  ELSE
    RAISE NOTICE 'Post-backfill: all sales/marketing artifacts have expected module bindings — safe to deploy fallback removal';
  END IF;
END $$;
