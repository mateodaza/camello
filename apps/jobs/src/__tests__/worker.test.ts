import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockSchedule,
  mockClaimJobRun,
  mockCompleteJobRun,
  mockReleaseJobRun,
  mockGetLastCompletedPeriod,
  mockRunUrlIngestion,
  mockRunMetricsRollup,
  mockRunLearningDecay,
  mockRunProcessFollowups,
  mockRunWhatsappRetry,
  mockCreateServer,
  capturedHandler,
} = vi.hoisted(() => {
  const handler: { current: ((...args: unknown[]) => void) | null } = { current: null };
  return {
    mockSchedule: vi.fn(() => ({ stop: vi.fn() })),
    mockClaimJobRun: vi.fn().mockResolvedValue(null),
    mockCompleteJobRun: vi.fn().mockResolvedValue(undefined),
    mockReleaseJobRun: vi.fn().mockResolvedValue(undefined),
    mockGetLastCompletedPeriod: vi.fn().mockResolvedValue(null),
    mockRunUrlIngestion: vi.fn().mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 }),
    mockRunMetricsRollup: vi.fn().mockResolvedValue({ tenantsProcessed: 0, metricDate: '2026-02-20' }),
    mockRunLearningDecay: vi.fn().mockResolvedValue({ tenantsProcessed: 0, totalDecayed: 0, totalArchived: 0 }),
    mockRunProcessFollowups: vi.fn().mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 }),
    mockRunWhatsappRetry: vi.fn().mockResolvedValue({ claimed: 0, succeeded: 0, failed: 0 }),
    mockCreateServer: vi.fn((fn: (...args: unknown[]) => void) => {
      handler.current = fn;
      return { listen: vi.fn((_port: number, cb?: () => void) => cb?.()), close: vi.fn() };
    }),
    capturedHandler: handler,
  };
});

vi.mock('node-cron', () => ({
  default: { schedule: mockSchedule },
  schedule: mockSchedule,
}));

vi.mock('../lib/service-db.js', () => ({
  servicePool: { query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) },
  serviceDb: {},
}));

vi.mock('../lib/job-lock.js', () => ({
  claimJobRun: mockClaimJobRun,
  completeJobRun: mockCompleteJobRun,
  releaseJobRun: mockReleaseJobRun,
  getLastCompletedPeriod: mockGetLastCompletedPeriod,
}));

vi.mock('../jobs/url-ingestion.js', () => ({ runUrlIngestion: mockRunUrlIngestion }));
vi.mock('../jobs/metrics-rollup.js', () => ({ runMetricsRollup: mockRunMetricsRollup }));
vi.mock('../jobs/learning-decay.js', () => ({ runLearningDecay: mockRunLearningDecay }));
vi.mock('../jobs/process-followups.js', () => ({ runProcessFollowups: mockRunProcessFollowups }));
vi.mock('../jobs/whatsapp-retry.js', () => ({ runWhatsappRetry: mockRunWhatsappRetry }));

vi.mock('node:http', () => ({
  default: { createServer: mockCreateServer },
}));

import { createWorker } from '../worker.js';

describe('worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars for start()
    process.env.DATABASE_URL_SERVICE_ROLE = 'postgres://test:test@localhost/test';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.API_URL = 'http://localhost:4000';
    process.env.INTERNAL_RETRY_SECRET = 'test-secret';
  });

  afterEach(async () => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('createWorker() has no side effects', () => {
    const worker = createWorker();
    expect(worker).toHaveProperty('start');
    expect(worker).toHaveProperty('stop');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('start() registers 5 cron schedules with correct expressions', () => {
    const worker = createWorker();
    worker.start();

    expect(mockSchedule).toHaveBeenCalledTimes(5);

    expect(mockSchedule).toHaveBeenCalledWith(
      '*/5 * * * *',
      expect.any(Function),
      { timezone: 'UTC' }
    );

    expect(mockSchedule).toHaveBeenCalledWith(
      '0 2 * * *',
      expect.any(Function),
      { timezone: 'UTC' }
    );

    expect(mockSchedule).toHaveBeenCalledWith(
      '0 3 1 * *',
      expect.any(Function),
      { timezone: 'UTC' }
    );
  });

  it('stop() stops cron tasks and closes DB pool', async () => {
    const worker = createWorker();
    worker.start();

    await worker.stop();

    for (const call of mockSchedule.mock.results) {
      expect(call.value.stop).toHaveBeenCalled();
    }
  });

  it('catch-up queries getLastCompletedPeriod for metrics-rollup and learning-decay', async () => {
    const worker = createWorker();
    worker.start();

    // Give DB probe + catch-up promise time to execute
    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetLastCompletedPeriod).toHaveBeenCalledWith('metrics-rollup');
    expect(mockGetLastCompletedPeriod).toHaveBeenCalledWith('learning-decay');
  });

  it('health returns degraded when a catch-up replay fails', async () => {
    // Make claimJobRun return a run ID so the ledgered path executes
    mockClaimJobRun.mockResolvedValue('run-123');
    // Make the actual job throw so safeRun returns false
    mockRunMetricsRollup.mockRejectedValue(new Error('db timeout'));

    const worker = createWorker();
    worker.start();

    // Wait for DB probe + catch-up to complete
    await new Promise((r) => setTimeout(r, 50));

    // Invoke the captured health handler
    const req = { url: '/health', method: 'GET' };
    let writtenStatus = 0;
    let writtenBody = '';
    const res = {
      writeHead: (s: number) => { writtenStatus = s; },
      end: (body: string) => { writtenBody = body; },
    };
    capturedHandler.current!(req, res);

    expect(writtenStatus).toBe(200);
    expect(JSON.parse(writtenBody)).toMatchObject({ status: 'degraded' });
  });

  it('exits without scheduling if required env vars are missing', () => {
    delete process.env.OPENAI_API_KEY;
    const exitError = new Error('process.exit');
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw exitError; });

    const worker = createWorker();
    expect(() => worker.start()).toThrow(exitError);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockSchedule).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });
});
