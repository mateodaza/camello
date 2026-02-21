-- Job execution ledger for cron deduplication and catch-up.
-- No RLS — accessed via service-role pool only (same pattern as paddle_webhook_events).

CREATE TABLE IF NOT EXISTS job_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text NOT NULL,
  period       text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result       jsonb,
  CONSTRAINT job_runs_name_period_idx UNIQUE (job_name, period),
  CONSTRAINT job_runs_period_format CHECK (period ~ '^\d{4}-\d{2}(-\d{2})?$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON job_runs TO app_user;
