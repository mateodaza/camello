-- Migration 0021: Add display_name column to customers
-- Non-breaking: nullable text column, no default needed

ALTER TABLE customers ADD COLUMN display_name text;

-- Backfill existing unnamed customers with sequential "Visitor N" per tenant
WITH numbered AS (
  SELECT id, tenant_id,
    ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY first_seen_at, id) AS seq
  FROM customers
  WHERE name IS NULL
)
UPDATE customers c
SET display_name = 'Visitor ' || n.seq
FROM numbered n
WHERE c.id = n.id;
