-- Add 'advisor' to artifact type constraint
-- Note: existing constraint name in DB is 'artifacts_type_values' (Drizzle generated);
-- also drop 'artifacts_type_check' in case it was applied with that name.
ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_type_values;
ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_type_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_type_check
  CHECK (type IN ('sales', 'support', 'marketing', 'custom', 'advisor'));
