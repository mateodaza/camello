import { servicePool } from './service-db.js';

const STALE_LOCK_HOURS = 24;

/**
 * Attempt to claim a job period. Returns the run ID if claimed,
 * null if already ran or currently locked by another instance.
 * Stale locks (started >24h ago, never completed) are deleted first.
 */
export async function claimJobRun(jobName: string, period: string): Promise<string | null> {
  await servicePool.query(
    `DELETE FROM job_runs
     WHERE job_name = $1 AND period = $2
       AND completed_at IS NULL
       AND started_at < now() - interval '${STALE_LOCK_HOURS} hours'`,
    [jobName, period]
  );

  const { rows } = await servicePool.query<{ id: string }>(
    `INSERT INTO job_runs (job_name, period) VALUES ($1, $2)
     ON CONFLICT (job_name, period) DO NOTHING RETURNING id`,
    [jobName, period]
  );

  return rows[0]?.id ?? null;
}

/** Mark a claimed run as completed with its result. */
export async function completeJobRun(runId: string, result: unknown): Promise<void> {
  await servicePool.query(
    `UPDATE job_runs SET completed_at = now(), result = $2::jsonb WHERE id = $1`,
    [runId, JSON.stringify(result)]
  );
}

/** Release a claimed run so the period can be retried on the next tick. */
export async function releaseJobRun(runId: string): Promise<void> {
  await servicePool.query(`DELETE FROM job_runs WHERE id = $1`, [runId]);
}

/** Get the latest completed period for a job (for catch-up logic). */
export async function getLastCompletedPeriod(jobName: string): Promise<string | null> {
  const { rows } = await servicePool.query<{ period: string }>(
    `SELECT period FROM job_runs
     WHERE job_name = $1 AND completed_at IS NOT NULL
     ORDER BY period DESC LIMIT 1`,
    [jobName]
  );
  return rows[0]?.period ?? null;
}
