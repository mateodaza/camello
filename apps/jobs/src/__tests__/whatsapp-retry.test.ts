import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockServicePoolQuery, mockFetch } = vi.hoisted(() => ({
  mockServicePoolQuery: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock('../lib/service-db.js', () => ({
  servicePool: { query: mockServicePoolQuery },
}));

vi.stubGlobal('fetch', mockFetch);

import { runWhatsappRetry } from '../jobs/whatsapp-retry.js';

describe('runWhatsappRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_URL = 'http://localhost:4000';
    process.env.INTERNAL_RETRY_SECRET = 'test-secret';
  });

  it('claim SQL filters to whatsapp channel only', async () => {
    mockServicePoolQuery.mockResolvedValue({ rows: [] });
    await runWhatsappRetry();
    const sql: string = mockServicePoolQuery.mock.calls[0][0];
    expect(sql).toContain("channel_type = 'whatsapp'");
  });

  it('claim SQL skips fresh events (< 10 min) — asserts interval filter', async () => {
    mockServicePoolQuery.mockResolvedValue({ rows: [] });
    await runWhatsappRetry();
    const sql: string = mockServicePoolQuery.mock.calls[0][0];
    expect(sql).toMatch(/10 minutes/);
    expect(sql).toContain('processed_at IS NULL');
  });

  it('claim SQL skips exhausted retries — asserts retry_count < 3 filter', async () => {
    mockServicePoolQuery.mockResolvedValue({ rows: [] });
    await runWhatsappRetry();
    const sql: string = mockServicePoolQuery.mock.calls[0][0];
    expect(sql).toMatch(/retry_count < 3/);
  });

  it('returns { claimed:1, succeeded:0, failed:1 } when API call throws — does not crash', async () => {
    mockServicePoolQuery.mockResolvedValue({ rows: [{ id: 'evt-fail' }] });
    mockFetch.mockRejectedValue(new Error('connection refused'));
    const result = await runWhatsappRetry();
    expect(result).toEqual({ claimed: 1, succeeded: 0, failed: 1 });
  });

  it('returns { claimed:1, succeeded:1, failed:0 } when API call succeeds', async () => {
    mockServicePoolQuery.mockResolvedValue({ rows: [{ id: 'evt-ok' }] });
    mockFetch.mockResolvedValue({ ok: true });
    const result = await runWhatsappRetry();
    expect(result).toEqual({ claimed: 1, succeeded: 1, failed: 0 });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/internal/webhook-retry',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-secret': 'test-secret' }),
      }),
    );
  });

  it('returns { claimed:0 } and makes no fetch calls when no stale rows', async () => {
    mockServicePoolQuery.mockResolvedValue({ rows: [] });
    const result = await runWhatsappRetry();
    expect(result).toEqual({ claimed: 0, succeeded: 0, failed: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
