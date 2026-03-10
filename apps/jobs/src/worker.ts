import http from 'node:http';
import cron, { type ScheduledTask } from 'node-cron';
import { runLearningDecay } from './jobs/learning-decay.js';
import { runMetricsRollup } from './jobs/metrics-rollup.js';
import { runUrlIngestion } from './jobs/url-ingestion.js';
import { runProcessFollowups } from './jobs/process-followups.js';
import { claimJobRun, completeJobRun, getLastCompletedPeriod, releaseJobRun } from './lib/job-lock.js';
import { servicePool } from './lib/service-db.js';
import { log } from './lib/logger.js';

const REQUIRED_ENV = ['DATABASE_URL_SERVICE_ROLE', 'OPENAI_API_KEY'] as const;
const CATCHUP_DAYS = parseInt(process.env.METRICS_CATCHUP_DAYS ?? '7', 10);
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SHUTDOWN_TIMEOUT_MS = 60_000;

function formatMonthPeriod(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatDayPeriod(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function createWorker() {
  const runningJobs = new Set<string>();
  const tasks: ScheduledTask[] = [];
  let healthServer: http.Server | null = null;
  let stopping = false;
  let ready = false;
  let catchUpFailed = false;

  async function safeRun(name: string, fn: () => Promise<unknown>): Promise<boolean> {
    if (runningJobs.has(name)) {
      log.warn(`Skipping ${name} — previous run still in progress`);
      return false;
    }
    runningJobs.add(name);
    const start = Date.now();
    try {
      const result = await fn();
      log.info(`${name} completed`, { durationMs: Date.now() - start, result: result as Record<string, unknown> });
      return true;
    } catch (err) {
      log.error(`${name} failed`, {
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      runningJobs.delete(name);
    }
  }

  async function runLedgeredMetricsRollup(metricDate: Date) {
    const period = formatDayPeriod(metricDate);
    const runId = await claimJobRun('metrics-rollup', period);
    if (!runId) {
      log.info(`metrics-rollup: period ${period} already completed or locked`);
      return;
    }
    try {
      const result = await runMetricsRollup(metricDate);
      await completeJobRun(runId, result);
    } catch (err) {
      await releaseJobRun(runId);
      throw err;
    }
  }

  async function runLedgeredLearningDecay() {
    const period = formatMonthPeriod(new Date());
    const runId = await claimJobRun('learning-decay', period);
    if (!runId) {
      log.info(`learning-decay: period ${period} already completed or locked`);
      return;
    }
    try {
      const result = await runLearningDecay();
      await completeJobRun(runId, result);
    } catch (err) {
      await releaseJobRun(runId);
      throw err;
    }
  }

  async function catchUp() {
    log.info('Running startup catch-up...');
    let failures = 0;

    // --- Metrics rollup catch-up (bounded by CATCHUP_DAYS) ---
    const lastMetricsPeriod = await getLastCompletedPeriod('metrics-rollup');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const oldestAllowed = new Date(today);
    oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - CATCHUP_DAYS);

    let catchupStart: Date;
    if (lastMetricsPeriod) {
      // Start from the day after the last completed period
      const lastDate = new Date(lastMetricsPeriod + 'T00:00:00Z');
      lastDate.setUTCDate(lastDate.getUTCDate() + 1);
      // Clamp: never go further back than CATCHUP_DAYS
      catchupStart = lastDate > oldestAllowed ? lastDate : oldestAllowed;
    } else {
      // First deploy — start from CATCHUP_DAYS ago
      catchupStart = oldestAllowed;
    }

    // Yesterday is the latest date we can roll up (today is incomplete)
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    let metricsCaughtUp = 0;
    const cursor = new Date(catchupStart);
    while (cursor <= yesterday) {
      const ok = await safeRun(`metrics-rollup-catchup[${formatDayPeriod(cursor)}]`, () =>
        runLedgeredMetricsRollup(new Date(cursor))
      );
      if (!ok) failures++;
      metricsCaughtUp++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (metricsCaughtUp > 0) {
      log.info(`Metrics rollup catch-up: replayed ${metricsCaughtUp} day(s)`);
    }

    // --- Learning decay catch-up (current month only) ---
    const currentMonthPeriod = formatMonthPeriod(new Date());
    const lastDecayPeriod = await getLastCompletedPeriod('learning-decay');
    const now = new Date();
    // Only catch up if current month is missing AND we're past the 1st 03:00 UTC
    if (lastDecayPeriod !== currentMonthPeriod && (now.getUTCDate() > 1 || now.getUTCHours() >= 3)) {
      log.info(`Learning decay catch-up: running for ${currentMonthPeriod}`);
      const ok = await safeRun('learning-decay-catchup', runLedgeredLearningDecay);
      if (!ok) failures++;
    }

    if (failures > 0) {
      catchUpFailed = true;
      log.warn(`Startup catch-up complete with ${failures} failure(s)`);
    } else {
      log.info('Startup catch-up complete');
    }
  }

  function startHealthServer(): http.Server {
    const server = http.createServer((_req, res) => {
      if (_req.url === '/health' && _req.method === 'GET') {
        const status = ready ? 200 : 503;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: ready ? (catchUpFailed ? 'degraded' : 'ok') : 'starting',
          uptime: process.uptime(),
          runningJobs: [...runningJobs],
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(PORT, () => {
      log.info(`Health server listening on port ${PORT}`);
    });
    return server;
  }

  return {
    start() {
      // Fail fast if required env vars are missing
      const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
      if (missing.length > 0) {
        log.error(`Missing required env vars: ${missing.join(', ')}`);
        process.exit(1);
      }

      log.info('Worker starting...', { catchupDays: CATCHUP_DAYS, port: PORT });

      // Start health server early (Railway needs the port), but returns 503 until ready
      healthServer = startHealthServer();

      // DB probe, then mark ready. Catch-up runs in background.
      (async () => {
        try {
          await servicePool.query('SELECT 1');
          log.info('DB connectivity confirmed');
        } catch (err) {
          log.error('DB connectivity check failed — exiting', {
            error: err instanceof Error ? err.message : String(err),
          });
          process.exit(1);
        }

        // Ready for Railway healthcheck after DB probe — catch-up is best-effort
        ready = true;
        log.info('Worker ready');

        try {
          await catchUp();
        } catch (err) {
          catchUpFailed = true;
          log.error('Catch-up failed', { error: err instanceof Error ? err.message : String(err) });
        }
      })();

      // URL ingestion — every 5 minutes (no ledger, SKIP LOCKED is idempotent)
      tasks.push(
        cron.schedule('*/5 * * * *', () => {
          void safeRun('url-ingestion', runUrlIngestion);
        }, { timezone: 'UTC' })
      );

      // Follow-up queue — every 5 minutes (no ledger, SKIP LOCKED is idempotent)
      tasks.push(
        cron.schedule('*/5 * * * *', () => {
          void safeRun('process-followups', runProcessFollowups);
        }, { timezone: 'UTC' })
      );

      // Metrics rollup — daily at 2:00 AM UTC
      tasks.push(
        cron.schedule('0 2 * * *', () => {
          const yesterday = new Date();
          yesterday.setUTCDate(yesterday.getUTCDate() - 1);
          yesterday.setUTCHours(0, 0, 0, 0);
          void safeRun('metrics-rollup', () => runLedgeredMetricsRollup(yesterday));
        }, { timezone: 'UTC' })
      );

      // Learning decay — 1st of every month at 3:00 AM UTC
      tasks.push(
        cron.schedule('0 3 1 * *', () => {
          void safeRun('learning-decay', runLedgeredLearningDecay);
        }, { timezone: 'UTC' })
      );

      log.info('Worker started — 4 cron schedules registered');

      // Graceful shutdown
      const shutdown = () => {
        if (stopping) return;
        stopping = true;
        log.info('Shutting down...');

        // Stop scheduling new runs
        for (const task of tasks) task.stop();

        // Wait for running jobs to finish (up to SHUTDOWN_TIMEOUT_MS)
        const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
        const check = () => {
          if (runningJobs.size === 0 || Date.now() >= deadline) {
            if (runningJobs.size > 0) {
              log.warn(`Shutdown timeout — ${runningJobs.size} job(s) still running: ${[...runningJobs].join(', ')}`);
            }
            servicePool.end().catch(() => {});
            healthServer?.close();
            log.info('Worker stopped');
            process.exit(0);
          } else {
            setTimeout(check, 1000);
          }
        };
        check();
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    },

    async stop() {
      stopping = true;
      for (const task of tasks) task.stop();
      await servicePool.end();
      healthServer?.close();
    },
  };
}
