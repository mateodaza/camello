import { describe, it, expect } from 'vitest';
import { computeFollowupOutcome, processClaimedRows } from '../jobs/process-followups.js';

describe('process-followups (unit)', () => {

  describe('computeFollowupOutcome', () => {
    it('marks valid past-due row as processed', () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
      const result = computeFollowupOutcome({ scheduled_at: pastDate }, new Date());
      expect(result.status).toBe('processed');
      expect(result.error).toBeUndefined();
    });

    it('leaves future row as queued (not yet due)', () => {
      const futureDate = new Date(Date.now() + 3_600_000).toISOString(); // 1 hr from now
      const result = computeFollowupOutcome({ scheduled_at: futureDate }, new Date());
      expect(result.status).toBe('queued');
    });

    it('marks row with invalid date as failed', () => {
      const result = computeFollowupOutcome({ scheduled_at: 'not-a-date' }, new Date());
      expect(result.status).toBe('failed');
      expect(result.error).toBeTruthy();
    });

    it('marks row with missing scheduled_at as failed', () => {
      const result = computeFollowupOutcome({}, new Date());
      expect(result.status).toBe('failed');
      expect(result.error).toBeTruthy();
    });

    it('marks row with null scheduled_at as failed', () => {
      const result = computeFollowupOutcome({ scheduled_at: null }, new Date());
      expect(result.status).toBe('failed');
      expect(result.error).toBeTruthy();
    });
  });

  describe('processClaimedRows', () => {
    it('returns { processed: 0, succeeded: 0, failed: 0 } for empty queue', () => {
      // Exercises the actual no-rows branch of processClaimedRows,
      // not a hardcoded object assertion.
      const result = processClaimedRows([], new Date());
      expect(result).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });

    it('counts past-due row as succeeded', () => {
      const pastDate = new Date(Date.now() - 60_000).toISOString();
      const result = processClaimedRows(
        [{ id: 'row-1', output: { scheduled_at: pastDate } }],
        new Date()
      );
      expect(result).toEqual({ processed: 1, succeeded: 1, failed: 0 });
    });

    it('counts invalid-date row as failed', () => {
      const result = processClaimedRows(
        [{ id: 'row-1', output: { scheduled_at: 'bad' } }],
        new Date()
      );
      expect(result).toEqual({ processed: 1, succeeded: 0, failed: 1 });
    });

    it('counts future-dated row as neither succeeded nor failed (skipped)', () => {
      const futureDate = new Date(Date.now() + 3_600_000).toISOString();
      const result = processClaimedRows(
        [{ id: 'row-1', output: { scheduled_at: futureDate } }],
        new Date()
      );
      expect(result).toEqual({ processed: 1, succeeded: 0, failed: 0 });
    });
  });

});
