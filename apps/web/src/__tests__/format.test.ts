import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fmtConversationTime } from '@/lib/format';

// Fix "now" to 2026-01-10 15:00:00 UTC (Saturday afternoon)
const NOW = new Date('2026-01-10T15:00:00.000Z');

/**
 * Minimal translation mock that matches the English messages in en.json.
 * Provides the same output as useTranslations('inbox') with English locale.
 */
const t = (key: string, values?: { count?: number }): string => {
  if (key === 'timeJustNow') return 'just now';
  if (key === 'timeMinutesAgo') return `${values?.count}m ago`;
  if (key === 'timeHoursAgo') return `${values?.count}h ago`;
  if (key === 'timeYesterday') return 'yesterday';
  if (key === 'timeDaysAgo') return `${values?.count}d ago`;
  if (key === 'timeWeeksAgo') return `${values?.count}w ago`;
  return key;
};

describe('fmtConversationTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('5 — returns "Xm ago" for a message sent minutes ago', () => {
    // 5 minutes before NOW, same calendar day
    expect(fmtConversationTime(new Date('2026-01-10T14:55:00.000Z'), t)).toBe('5m ago');
  });

  it('6 — returns "Xh ago" for a message sent hours ago today', () => {
    // 2 hours before NOW, same calendar day
    expect(fmtConversationTime(new Date('2026-01-10T13:00:00.000Z'), t)).toBe('2h ago');
  });

  it('7 — returns "yesterday" for a message from the previous calendar day', () => {
    // Previous calendar day at noon UTC — unambiguously Jan 9 in all UTC-standard CI timezones
    expect(fmtConversationTime(new Date('2026-01-09T12:00:00.000Z'), t)).toBe('yesterday');
  });

  it('8 — returns "Xd ago" for older messages', () => {
    // 3 days before NOW
    expect(fmtConversationTime(new Date('2026-01-07T12:00:00.000Z'), t)).toBe('3d ago');
  });
});
