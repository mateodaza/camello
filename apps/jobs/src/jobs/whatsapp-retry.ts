import { servicePool } from '../lib/service-db.js';
import { log } from '../lib/logger.js';

export interface WhatsappRetryResult {
  claimed: number;
  succeeded: number;
  failed: number;
}

/**
 * WhatsApp dead-letter retry job.
 * Runs every 5 minutes via node-cron in worker.ts.
 *
 * Claims stale WhatsApp webhook_events rows (channel_type = 'whatsapp',
 * processed_at IS NULL, age >= 10 min, retry_count < 3) and calls the
 * API's internal retry endpoint for each.
 *
 * retry_count is incremented atomically in the claim UPDATE before any
 * fetch attempt — ensures the counter advances even on crash.
 */
export async function runWhatsappRetry(): Promise<WhatsappRetryResult> {
  log.info('whatsapp-retry: starting');

  // Atomic claim: increment retry_count before processing (crash-safe counter).
  // channel_type = 'whatsapp' scopes claims to WhatsApp only — future channels
  // with their own retry jobs are never touched here.
  const { rows } = await servicePool.query<{ id: string }>(
    `UPDATE webhook_events
     SET retry_count = retry_count + 1
     WHERE id IN (
       SELECT id FROM webhook_events
       WHERE channel_type = 'whatsapp'
         AND processed_at IS NULL
         AND retry_count < 3
         AND created_at < now() - interval '10 minutes'
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 20
     )
     RETURNING id`,
  );

  if (rows.length === 0) {
    log.info('whatsapp-retry: no stale rows');
    return { claimed: 0, succeeded: 0, failed: 0 };
  }

  log.info(`whatsapp-retry: claimed ${rows.length} row(s)`);

  let succeeded = 0;
  let failed = 0;

  const secret = process.env.INTERNAL_RETRY_SECRET;
  if (!secret) {
    log.error('whatsapp-retry: INTERNAL_RETRY_SECRET is not set — aborting batch');
    return { claimed: rows.length, succeeded: 0, failed: rows.length };
  }

  for (const row of rows) {
    try {
      const res = await fetch(
        `${process.env.API_URL}/api/internal/webhook-retry`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret,
          },
          body: JSON.stringify({ webhookEventId: row.id }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`API returned ${res.status}: ${body}`);
      }
      succeeded++;
    } catch (err) {
      log.error(`whatsapp-retry: failed for event ${row.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
      // retry_count already incremented — row stays unprocessed for next sweep
      // until retry_count reaches 3, at which point it requires manual intervention
    }
  }

  const summary = { claimed: rows.length, succeeded, failed };
  log.info('whatsapp-retry: complete', summary);
  return summary;
}
