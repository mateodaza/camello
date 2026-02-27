-- Migration 0013: Agent Workspaces — Schema Changes + Module Seeds
-- Adds lead pipeline stages, denormalized module_slug on executions,
-- autonomy provenance tracking, and seeds 6 new modules.

-- =====================================================================
-- 1. Leads: add stage + estimated_value for pipeline tracking
-- =====================================================================

ALTER TABLE leads ADD COLUMN stage text NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD CONSTRAINT leads_stage_values
  CHECK (stage IN ('new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'));
ALTER TABLE leads ADD COLUMN estimated_value numeric(12,2);

-- Composite index for pipeline queries (tenant + stage + score + recency)
CREATE INDEX idx_leads_tenant_stage ON leads(tenant_id, stage, score, created_at DESC);

-- =====================================================================
-- 2. Module executions: denormalize module_slug for fast dashboard queries
--    Every dashboard query filters by module type — this avoids a JOIN to modules.
--    Slugs never change, so this denormalization is safe.
-- =====================================================================

-- Step A: add nullable column
ALTER TABLE module_executions ADD COLUMN module_slug text;

-- Step B: backfill from modules table
UPDATE module_executions me
SET module_slug = m.slug
FROM modules m
WHERE me.module_id = m.id;

-- Step C: safety gate — fail if any rows have NULL slug (orphaned module_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM module_executions WHERE module_slug IS NULL) THEN
    RAISE EXCEPTION 'module_slug backfill incomplete — orphaned module_id rows exist';
  END IF;
END $$;

-- Step D: enforce NOT NULL going forward
ALTER TABLE module_executions ALTER COLUMN module_slug SET NOT NULL;

-- Step E: composite index for workspace queries
CREATE INDEX idx_module_executions_slug ON module_executions(tenant_id, module_slug, status, created_at DESC);

-- =====================================================================
-- 3. Seed new modules into global catalog (idempotent via ON CONFLICT)
-- =====================================================================

INSERT INTO modules (name, slug, description, category, is_system, input_schema, output_schema)
VALUES
  ('Collect Payment', 'collect_payment', 'Collect payment via configured payment link', 'sales', true,
   '{"type":"object","properties":{"amount":{"type":"string"},"description":{"type":"string"},"currency":{"type":"string"}}}',
   '{"type":"object","properties":{"payment_url":{"type":"string"},"status":{"type":"string"}}}'),
  ('Send Quote', 'send_quote', 'Generate a structured quote with line items', 'sales', true,
   '{"type":"object","properties":{"items":{"type":"array"},"currency":{"type":"string"},"valid_days":{"type":"number"}}}',
   '{"type":"object","properties":{"quote_id":{"type":"string"},"total":{"type":"string"},"status":{"type":"string"}}}'),
  ('Create Ticket', 'create_ticket', 'Create a support ticket from conversation', 'support', true,
   '{"type":"object","properties":{"subject":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"category":{"type":"string"}}}',
   '{"type":"object","properties":{"ticket_id":{"type":"string"},"status":{"type":"string"}}}'),
  ('Escalate to Human', 'escalate_to_human', 'Escalate conversation to human agent', 'support', true,
   '{"type":"object","properties":{"reason":{"type":"string"},"urgency":{"type":"string"},"summary":{"type":"string"}}}',
   '{"type":"object","properties":{"escalated":{"type":"boolean"},"conversation_status":{"type":"string"}}}'),
  ('Capture Interest', 'capture_interest', 'Capture customer interest in product or topic', 'marketing', true,
   '{"type":"object","properties":{"product_or_topic":{"type":"string"},"interest_level":{"type":"string"},"contact_info":{"type":"string"}}}',
   '{"type":"object","properties":{"logged":{"type":"boolean"},"follow_up_recommended":{"type":"boolean"}}}'),
  ('Draft Content', 'draft_content', 'Draft marketing content from conversation context', 'marketing', true,
   '{"type":"object","properties":{"content_type":{"type":"string"},"topic":{"type":"string"},"key_points":{"type":"array"}}}',
   '{"type":"object","properties":{"draft_text":{"type":"string"},"status":{"type":"string"}}}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema;

-- Post-check: verify all 6 new slugs exist
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM modules WHERE slug IN (
    'collect_payment', 'send_quote', 'create_ticket',
    'escalate_to_human', 'capture_interest', 'draft_content'
  )) < 6 THEN
    RAISE EXCEPTION 'Not all 6 new module slugs were seeded into modules table';
  END IF;
END $$;

-- =====================================================================
-- 4. Autonomy source tracking on artifact_modules
--    Distinguishes "system set this default" from "owner explicitly chose"
-- =====================================================================

ALTER TABLE artifact_modules ADD COLUMN autonomy_source text NOT NULL DEFAULT 'default';
ALTER TABLE artifact_modules ADD CONSTRAINT artifact_modules_autonomy_source_values
  CHECK (autonomy_source IN ('default', 'manual'));
