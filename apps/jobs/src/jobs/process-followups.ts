import { servicePool } from '../lib/service-db.js';
import { log } from '../lib/logger.js';

export interface ClaimedRow {
  id: string;
  output: unknown; // JSONB column, narrowed inside helpers
}

/**
 * Determines the followup outcome for a single claimed row.
 * Pure function — no DB access. Exported for unit testing.
 *
 * @returns 'processed' if scheduled_at <= now (due)
 *          'queued'    if scheduled_at > now (not yet due, leave as-is)
 *          'failed'    if scheduled_at is missing, null, or invalid
 */
export function computeFollowupOutcome(
  output: Record<string, unknown>,
  now: Date,
): { status: 'processed' | 'failed' | 'queued'; error?: string } {
  const raw = output.scheduled_at;

  if (raw === undefined || raw === null) {
    return { status: 'failed', error: 'missing scheduled_at' };
  }

  const parsed = new Date(raw as string);
  if (isNaN(parsed.getTime())) {
    return { status: 'failed', error: 'invalid scheduled_at' };
  }

  if (parsed <= now) {
    return { status: 'processed' };
  }

  return { status: 'queued' };
}

/**
 * Accumulates outcomes for already-claimed rows.
 * Pure function — no DB access. Exported for unit testing.
 *
 * 'queued' rows (future-dated) count toward processed but not succeeded/failed —
 * they remain as-is and will reappear on the next 5-minute run.
 */
export function processClaimedRows(
  rows: ClaimedRow[],
  now: Date,
): { processed: number; succeeded: number; failed: number } {
  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const outcome = computeFollowupOutcome(row.output as Record<string, unknown>, now);
    if (outcome.status === 'processed') succeeded++;
    else if (outcome.status === 'failed') failed++;
    // 'queued' — skip, leave for next run
  }

  return { processed: rows.length, succeeded, failed };
}

/**
 * Follow-up queue processor (polling cron).
 * Runs every 5 minutes, claims up to 50 executed send_followup rows
 * using FOR UPDATE SKIP LOCKED for race-safe concurrent processing.
 *
 * - Past-due rows  → followup_status = 'processed' + followup_processed_at = NOW()
 * - Invalid rows   → followup_status = 'failed' + followup_error = reason
 * - Future rows    → left untouched, re-examined next run
 */
export async function runProcessFollowups(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  log.info('process-followups: starting');

  const client = await servicePool.connect();

  try {
    await client.query('BEGIN');

    const { rows: claimed } = await client.query<ClaimedRow>(
      `SELECT id, output
       FROM module_executions
       WHERE module_slug = 'send_followup'
         AND status = 'executed'
         AND output->>'followup_status' = 'queued'
       ORDER BY created_at
       LIMIT 50
       FOR UPDATE SKIP LOCKED`,
    );

    if (claimed.length === 0) {
      await client.query('COMMIT');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    log.info(`process-followups: claimed ${claimed.length} row(s)`);

    const now = new Date();

    for (const row of claimed) {
      const outcome = computeFollowupOutcome(row.output as Record<string, unknown>, now);

      if (outcome.status === 'processed') {
        await client.query(
          `UPDATE module_executions
           SET output = jsonb_set(
                 jsonb_set(output, '{followup_status}', '"processed"'),
                 '{followup_processed_at}', to_jsonb(NOW())
               )
           WHERE id = $1`,
          [row.id],
        );
      } else if (outcome.status === 'failed') {
        await client.query(
          `UPDATE module_executions
           SET output = jsonb_set(
                 jsonb_set(output, '{followup_status}', '"failed"'),
                 '{followup_error}', to_jsonb($2::text)
               )
           WHERE id = $1`,
          [row.id, outcome.error],
        );
      }
      // 'queued' → no UPDATE, leave as-is for next run
    }

    await client.query('COMMIT');

    const summary = processClaimedRows(claimed, now);
    log.info('process-followups: complete', summary);
    return summary;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
