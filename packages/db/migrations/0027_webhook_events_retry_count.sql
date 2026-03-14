ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
