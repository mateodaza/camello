-- Migration 0015: Sales workspace upgrade
-- Adds: leads.close_reason, one-lead-per-conversation invariant, payments table

-- 1. leads: optional close reason for win/loss tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS close_reason text;

-- 2. One-lead-per-conversation invariant (partial unique index — NULLs not constrained)
-- Multiple queries in this sprint assume conversation_id → at most one lead:
-- salesQuotes enrichment (LEFT JOIN leads ON conversation_id), payment prefill,
-- and after-hours SUM estimated_value. Without this, those queries can produce
-- duplicate rows or double-count pipeline value.
-- The partial index (WHERE conversation_id IS NOT NULL) allows manually created
-- leads with no conversation while still enforcing the invariant for AI-created ones.
-- IMPORTANT: if existing data has duplicate conversation_ids in leads, this migration
-- will fail. Run the pre-flight check first:
--   SELECT conversation_id, COUNT(*) FROM leads
--   WHERE conversation_id IS NOT NULL
--   GROUP BY conversation_id HAVING COUNT(*) > 1
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_conversation_unique
  ON leads (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- 3. Index for deal velocity (closed deals with timestamps)
CREATE INDEX IF NOT EXISTS idx_leads_velocity
  ON leads (tenant_id, stage, qualified_at, converted_at)
  WHERE stage IN ('closed_won', 'closed_lost');

-- 4. Payments table
-- artifact_id is the immutable ownership key — set once at creation, never re-derived from
-- conversation or lead links (those are mutable, e.g. via handoffs).
-- lead_id and conversation_id are provenance only.
CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  artifact_id        UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,  -- owner, immutable
  lead_id            UUID REFERENCES leads(id) ON DELETE SET NULL,              -- provenance
  conversation_id    UUID REFERENCES conversations(id) ON DELETE SET NULL,      -- provenance
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  quote_execution_id UUID REFERENCES module_executions(id) ON DELETE SET NULL,
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency           TEXT NOT NULL DEFAULT 'USD',
  description        TEXT,
  payment_url        TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','sent','viewed','paid','overdue','cancelled')),
  due_date           TIMESTAMPTZ,
  paid_at            TIMESTAMPTZ,
  reference          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS — scope by tenant; workspace queries always include artifact_id for isolation
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_tenant_isolation ON payments
  FOR ALL USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
GRANT SELECT, INSERT, UPDATE ON payments TO app_user;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_artifact_status
  ON payments (artifact_id, status, created_at DESC);  -- primary workspace query
CREATE INDEX IF NOT EXISTS idx_payments_tenant_status
  ON payments (tenant_id, status, created_at DESC);    -- cross-workspace queries

-- Post-check assertions
DO $$ BEGIN
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'close_reason'
  )), 'leads.close_reason missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'leads' AND indexname = 'idx_leads_conversation_unique'
  )), 'leads conversation_id unique index missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'artifact_id'
  )), 'payments.artifact_id missing';

  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'payments'
  )), 'payments table missing';
END $$;
