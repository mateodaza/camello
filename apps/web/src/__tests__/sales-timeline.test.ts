import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../components/agent-workspace/sales/lead-detail-sheet';

// ---------------------------------------------------------------------------
// buildTimeline — merge + sort correctness (Test 7)
// ---------------------------------------------------------------------------

describe('buildTimeline', () => {
  it('merges 5 item kinds and sorts newest-first with none dropped', () => {
    const result = buildTimeline({
      interactions: [{ intent: 'qualify', costUsd: '0.001', latencyMs: 100, createdAt: '2026-01-03T12:00:00Z' }],
      executions:   [{ moduleSlug: 'send_quote', status: 'executed', createdAt: '2026-01-01T08:00:00Z' }],
      notes:        [{ author: 'owner', content: 'Note text', createdAt: '2026-01-05T09:00:00Z' }],
      messages:     [{ role: 'customer', content: 'Hello', createdAt: '2026-01-02T15:00:00Z' }],
      stageChanges: [{ fromStage: 'new', toStage: 'qualifying', createdAt: '2026-01-04T10:00:00Z' }],
    });

    // All 5 items present
    expect(result).toHaveLength(5);

    // Sorted newest-first
    for (let i = 0; i < result.length - 1; i++) {
      expect(new Date(result[i].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(result[i + 1].createdAt).getTime(),
      );
    }

    // All 5 kind values present
    const kinds = result.map((item) => item.kind);
    expect(kinds).toContain('interaction');
    expect(kinds).toContain('execution');
    expect(kinds).toContain('note');
    expect(kinds).toContain('message');
    expect(kinds).toContain('stageChange');

    // Newest item is the note (2026-01-05)
    expect(result[0].kind).toBe('note');
    // Oldest item is the execution (2026-01-01)
    expect(result[result.length - 1].kind).toBe('execution');
  });
});
