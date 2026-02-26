-- Enable RLS on system tables that were missing it.
-- No policies needed: these are accessed only via service-role (which bypasses RLS).
-- This blocks unauthorized access through PostgREST.

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;
