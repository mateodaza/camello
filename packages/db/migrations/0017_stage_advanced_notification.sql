-- Migration 0017: Add stage_advanced to owner_notifications type constraint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'owner_notifications'
      AND constraint_name = 'owner_notifications_type_values'
      AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE owner_notifications DROP CONSTRAINT owner_notifications_type_values;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'owner_notifications'
      AND constraint_name = 'owner_notifications_type_check'
      AND constraint_type = 'CHECK'
  ) THEN
    ALTER TABLE owner_notifications DROP CONSTRAINT owner_notifications_type_check;
  END IF;
END $$;

ALTER TABLE owner_notifications
  ADD CONSTRAINT owner_notifications_type_values
  CHECK (type IN (
    'approval_needed', 'hot_lead', 'deal_closed',
    'lead_stale', 'escalation', 'budget_warning', 'stage_advanced'
  ));

DO $$ BEGIN
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'owner_notifications'
      AND constraint_name = 'owner_notifications_type_values'
      AND constraint_type = 'CHECK'
  )), 'owner_notifications_type_values constraint missing after migration';
END $$;
