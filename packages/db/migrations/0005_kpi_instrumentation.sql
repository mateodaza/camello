-- Migration 0005: KPI instrumentation
-- - Tenant-level monthly LLM budget
-- - Learnings source-module linkage for rollback controls
-- - Learning audit log with tenant-isolated RLS

-- 1) Tenant monthly LLM budget (nullable: NULL => use plan default)
ALTER TABLE tenants
  ADD COLUMN monthly_cost_budget_usd NUMERIC(10,4);

-- 2) Learnings source module linkage (for bulk clear by module)
ALTER TABLE learnings
  ADD COLUMN source_module_execution_id uuid REFERENCES module_executions(id),
  ADD COLUMN source_module_slug text;

CREATE INDEX idx_learnings_source_module_slug
  ON learnings(tenant_id, source_module_slug)
  WHERE source_module_slug IS NOT NULL;

-- 3) Learning audit logs
CREATE TABLE learning_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  learning_id uuid NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'created',
    'reinforced',
    'dismissed',
    'boosted',
    'bulk_cleared',
    'decayed',
    'archived'
  )),
  performed_by text,
  old_confidence numeric(3,2),
  new_confidence numeric(3,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learning_audit_logs_tenant
  ON learning_audit_logs(tenant_id, created_at DESC);

CREATE INDEX idx_learning_audit_logs_learning
  ON learning_audit_logs(learning_id);

-- 4) RLS policy for learning_audit_logs
ALTER TABLE learning_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON learning_audit_logs
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- 5) Runtime role grants
GRANT SELECT, INSERT, UPDATE, DELETE ON learning_audit_logs TO app_user;
