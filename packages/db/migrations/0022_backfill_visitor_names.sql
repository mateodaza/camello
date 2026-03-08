-- Migration 0022: Backfill polluted visitor_ names and assign display_name
-- Migration 0021 backfilled NULL-named customers. This migration:
-- 1. NULLs out name='visitor_*' (machine IDs, not real names)
-- 2. Assigns 'Visitor N' to all customers still without display_name,
--    continuing the per-tenant sequence from where 0021 left off.

-- Step 1: NULL out polluted names
UPDATE customers SET name = NULL WHERE name LIKE 'visitor_%';

-- Step 2: Assign sequential Visitor N, picking up after existing max seq
WITH max_seqs AS (
  SELECT tenant_id,
    COALESCE(MAX(
      CASE WHEN display_name ~ '^Visitor [0-9]+$'
        THEN SUBSTRING(display_name FROM '[0-9]+$')::int
      END
    ), 0) AS max_seq
  FROM customers
  GROUP BY tenant_id
),
to_assign AS (
  SELECT c.id, c.tenant_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.tenant_id ORDER BY c.first_seen_at, c.id
    ) AS rn
  FROM customers c
  WHERE c.display_name IS NULL
)
UPDATE customers c
SET display_name = 'Visitor ' || (ta.rn + ms.max_seq)
FROM to_assign ta
JOIN max_seqs ms ON ms.tenant_id = ta.tenant_id
WHERE c.id = ta.id;
