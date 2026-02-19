import { describe, it, expect } from 'vitest';
import {
  localDateStr,
  thirtyDaysAgoStr,
  fmtCost,
  fmtMicroCost,
  fmtDate,
  fmtDateTime,
  truncate,
  groupChunksByTitle,
} from './format';

// ---------------------------------------------------------------------------
// localDateStr
// ---------------------------------------------------------------------------
describe('localDateStr', () => {
  it('formats a known date as YYYY-MM-DD in local time', () => {
    // Use a mid-day hour to avoid timezone-shift edge cases
    const d = new Date(2026, 0, 5, 12, 0, 0); // Jan 5 2026 noon local
    expect(localDateStr(d)).toBe('2026-01-05');
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2025, 2, 3, 12, 0, 0); // Mar 3
    expect(localDateStr(d)).toBe('2025-03-03');
  });

  it('defaults to today when no arg given', () => {
    const result = localDateStr();
    // Just verify it's a valid YYYY-MM-DD format
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// thirtyDaysAgoStr
// ---------------------------------------------------------------------------
describe('thirtyDaysAgoStr', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(thirtyDaysAgoStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is less than today', () => {
    expect(thirtyDaysAgoStr() < localDateStr()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fmtCost / fmtMicroCost
// ---------------------------------------------------------------------------
describe('fmtCost', () => {
  it('formats number to 4 decimal places with $', () => {
    expect(fmtCost(1.5)).toBe('$1.5000');
  });

  it('handles string input', () => {
    expect(fmtCost('0.123456')).toBe('$0.1235');
  });

  it('handles zero', () => {
    expect(fmtCost(0)).toBe('$0.0000');
  });
});

describe('fmtMicroCost', () => {
  it('formats to 6 decimal places', () => {
    expect(fmtMicroCost(0.000123)).toBe('$0.000123');
  });

  it('handles string input', () => {
    expect(fmtMicroCost('0.00000042')).toBe('$0.000000');
  });
});

// ---------------------------------------------------------------------------
// fmtDate / fmtDateTime
// ---------------------------------------------------------------------------
describe('fmtDate', () => {
  it('returns em-dash for null', () => {
    expect(fmtDate(null)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(fmtDate(undefined)).toBe('—');
  });

  it('formats a valid date string', () => {
    const result = fmtDate('2026-01-15T12:00:00Z');
    // Locale-dependent, just verify non-empty and not em-dash
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('fmtDateTime', () => {
  it('returns em-dash for null', () => {
    expect(fmtDateTime(null)).toBe('—');
  });

  it('formats a valid date', () => {
    const result = fmtDateTime(new Date(2026, 0, 15, 14, 30));
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  it('returns string as-is when within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string as-is when exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles maxLen of 0', () => {
    expect(truncate('abc', 0)).toBe('…');
  });
});

// ---------------------------------------------------------------------------
// groupChunksByTitle
// ---------------------------------------------------------------------------
describe('groupChunksByTitle', () => {
  const makeChunk = (
    id: string,
    title: string | null,
    sourceType = 'upload',
    chunkIndex = 0,
  ) => ({
    id,
    title,
    sourceType,
    chunkIndex,
    createdAt: '2026-01-01T00:00:00Z',
  });

  it('groups chunks with the same title', () => {
    const chunks = [
      makeChunk('a1', 'FAQ doc', 'upload', 0),
      makeChunk('a2', 'FAQ doc', 'upload', 1),
      makeChunk('a3', 'FAQ doc', 'upload', 2),
    ];
    const result = groupChunksByTitle(chunks);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: 'FAQ doc',
      title: 'FAQ doc',
      chunkCount: 3,
    });
  });

  it('uses id as key for null-titled chunks (no grouping)', () => {
    const chunks = [
      makeChunk('id-1', null),
      makeChunk('id-2', null),
    ];
    const result = groupChunksByTitle(chunks);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ key: 'id-1', title: null, chunkCount: 1 });
    expect(result[1]).toMatchObject({ key: 'id-2', title: null, chunkCount: 1 });
  });

  it('separates chunks with different titles', () => {
    const chunks = [
      makeChunk('a1', 'Doc A'),
      makeChunk('b1', 'Doc B'),
      makeChunk('a2', 'Doc A'),
    ];
    const result = groupChunksByTitle(chunks);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.title === 'Doc A')?.chunkCount).toBe(2);
    expect(result.find((r) => r.title === 'Doc B')?.chunkCount).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(groupChunksByTitle([])).toEqual([]);
  });

  it('preserves sourceType from first chunk in group', () => {
    const chunks = [
      makeChunk('a1', 'Mixed', 'url', 0),
      makeChunk('a2', 'Mixed', 'upload', 1),
    ];
    const result = groupChunksByTitle(chunks);
    expect(result[0]!.sourceType).toBe('url');
  });
});
