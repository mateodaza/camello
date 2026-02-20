-- Migration: add unique index on knowledge_syncs(tenant_id, source_url)
-- Required by knowledge.queueUrl ON CONFLICT target
-- Handles pre-existing duplicates by keeping the newest row per (tenant_id, source_url)

-- Remove duplicates first (keep one row per tenant+url).
-- Uses row_number() to handle identical timestamps safely.
DELETE FROM knowledge_syncs
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY tenant_id, source_url
      ORDER BY created_at DESC, id DESC
    ) AS rn
    FROM knowledge_syncs
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_syncs_tenant_url
  ON knowledge_syncs (tenant_id, source_url);
