-- Migration 0014: Backfill — Bind new modules to existing artifacts + flip autonomy defaults
-- Pattern: same as 0011 (idempotent INSERT ON CONFLICT DO NOTHING).
-- Autonomy defaults derived from module risk tier:
--   low/medium → fully_autonomous, high → draft_and_approve

-- =====================================================================
-- Pre-check: all new module slugs must exist in modules table
-- =====================================================================

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM modules WHERE slug IN (
    'collect_payment', 'send_quote', 'create_ticket',
    'escalate_to_human', 'capture_interest', 'draft_content'
  )) < 6 THEN
    RAISE EXCEPTION 'Pre-check failed: not all 6 new module slugs exist in modules table. Run migration 0013 first.';
  END IF;
END $$;

-- =====================================================================
-- 1. Bind new modules to existing artifacts by archetype
-- =====================================================================

-- Sales artifacts: bind collect_payment (high→draft_and_approve) and send_quote (high→draft_and_approve)
INSERT INTO artifact_modules (artifact_id, module_id, tenant_id, autonomy_level, autonomy_source, config_overrides)
SELECT a.id, m.id, a.tenant_id,
  CASE WHEN m.slug IN ('collect_payment', 'send_quote') THEN 'draft_and_approve'::autonomy_level ELSE 'fully_autonomous'::autonomy_level END,
  'default',
  '{}'::jsonb
FROM artifacts a
CROSS JOIN modules m
WHERE a.type = 'sales'
  AND m.slug IN ('collect_payment', 'send_quote')
ON CONFLICT (artifact_id, module_id) DO NOTHING;

-- Support artifacts: bind create_ticket (low→fully_autonomous) and escalate_to_human (medium→fully_autonomous)
INSERT INTO artifact_modules (artifact_id, module_id, tenant_id, autonomy_level, autonomy_source, config_overrides)
SELECT a.id, m.id, a.tenant_id, 'fully_autonomous'::autonomy_level, 'default', '{}'::jsonb
FROM artifacts a
CROSS JOIN modules m
WHERE a.type = 'support'
  AND m.slug IN ('create_ticket', 'escalate_to_human')
ON CONFLICT (artifact_id, module_id) DO NOTHING;

-- Marketing artifacts: bind capture_interest (low→fully_autonomous) and draft_content (high→draft_and_approve)
INSERT INTO artifact_modules (artifact_id, module_id, tenant_id, autonomy_level, autonomy_source, config_overrides)
SELECT a.id, m.id, a.tenant_id,
  CASE WHEN m.slug = 'draft_content' THEN 'draft_and_approve'::autonomy_level ELSE 'fully_autonomous'::autonomy_level END,
  'default',
  '{}'::jsonb
FROM artifacts a
CROSS JOIN modules m
WHERE a.type = 'marketing'
  AND m.slug IN ('capture_interest', 'draft_content')
ON CONFLICT (artifact_id, module_id) DO NOTHING;

-- =====================================================================
-- 2. 70/30 autonomy correction: flip low/medium risk modules from
--    draft_and_approve to fully_autonomous (only for system-set defaults)
-- =====================================================================

-- Only update rows where autonomy_source = 'default' — never touch manual overrides
WITH low_medium_risk AS (
  SELECT id FROM modules WHERE slug IN (
    'qualify_lead', 'book_meeting', 'create_ticket',
    'escalate_to_human', 'send_followup', 'capture_interest'
  )
)
UPDATE artifact_modules am
SET autonomy_level = 'fully_autonomous'::autonomy_level
FROM low_medium_risk lmr
WHERE am.module_id = lmr.id
  AND am.autonomy_source = 'default'
  AND am.autonomy_level = 'draft_and_approve'::autonomy_level;

-- =====================================================================
-- Post-checks
-- =====================================================================

-- Verify no manual overrides were touched by the autonomy flip
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM artifact_modules am
    JOIN modules m ON am.module_id = m.id
    WHERE am.autonomy_source = 'manual'
      AND am.autonomy_level = 'fully_autonomous'::autonomy_level
      AND m.slug IN ('collect_payment', 'send_quote', 'draft_content')
  ) THEN
    RAISE NOTICE 'Warning: some manual overrides have fully_autonomous for high-risk modules. This is valid if owner-set.';
  END IF;
END $$;

-- Hard post-bind assertion: every archetype's artifacts must have ALL expected module bindings
DO $$
DECLARE
  _missing_sales   int;
  _missing_support int;
  _missing_mktg    int;
BEGIN
  -- Sales: expect 4 modules per artifact (qualify_lead, book_meeting, collect_payment, send_quote)
  SELECT COUNT(*) INTO _missing_sales
  FROM artifacts a
  WHERE a.type = 'sales'
    AND (SELECT COUNT(*) FROM artifact_modules am
         JOIN modules m ON am.module_id = m.id
         WHERE am.artifact_id = a.id
           AND m.slug IN ('qualify_lead', 'book_meeting', 'collect_payment', 'send_quote')
        ) < 4;

  IF _missing_sales > 0 THEN
    RAISE EXCEPTION 'Post-bind check failed: % sales artifact(s) have fewer than 4 expected module bindings', _missing_sales;
  END IF;

  -- Support: expect 2 modules per artifact (create_ticket, escalate_to_human)
  SELECT COUNT(*) INTO _missing_support
  FROM artifacts a
  WHERE a.type = 'support'
    AND (SELECT COUNT(*) FROM artifact_modules am
         JOIN modules m ON am.module_id = m.id
         WHERE am.artifact_id = a.id
           AND m.slug IN ('create_ticket', 'escalate_to_human')
        ) < 2;

  IF _missing_support > 0 THEN
    RAISE EXCEPTION 'Post-bind check failed: % support artifact(s) have fewer than 2 expected module bindings', _missing_support;
  END IF;

  -- Marketing: expect 3 modules per artifact (send_followup, capture_interest, draft_content)
  SELECT COUNT(*) INTO _missing_mktg
  FROM artifacts a
  WHERE a.type = 'marketing'
    AND (SELECT COUNT(*) FROM artifact_modules am
         JOIN modules m ON am.module_id = m.id
         WHERE am.artifact_id = a.id
           AND m.slug IN ('send_followup', 'capture_interest', 'draft_content')
        ) < 3;

  IF _missing_mktg > 0 THEN
    RAISE EXCEPTION 'Post-bind check failed: % marketing artifact(s) have fewer than 3 expected module bindings', _missing_mktg;
  END IF;

  RAISE NOTICE 'Post-bind assertion passed: all archetype artifacts have complete module coverage.';
END $$;
