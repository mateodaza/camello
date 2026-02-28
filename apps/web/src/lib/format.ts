/** Local-time YYYY-MM-DD string for <input type="date"> values. */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 30 days ago in local time as YYYY-MM-DD. */
export function thirtyDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateStr(d);
}

/** Format a numeric USD value as $X.XXXX (4 decimal places). */
export function fmtCost(value: string | number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(Number(value));
}

/** Format a numeric USD value as $X.XXXXXX (6 decimal places, for per-interaction). */
export function fmtMicroCost(value: string | number, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(Number(value));
}

/** Format an integer with locale separators (e.g. 1,234). */
export function fmtInt(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Format a Date or date-string to a short local date (e.g. "2/19/2026"). */
export function fmtDate(value: Date | string | null | undefined, locale?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

/** Format a Date or date-string to a short local datetime (e.g. "2/19/2026, 5:30 PM"). */
export function fmtDateTime(value: Date | string | null | undefined, locale?: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** Truncate a string to maxLen chars, appending "…" if truncated. */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
}

/** Humanize a snake_case identifier: "qualify_lead" → "Qualify lead" */
export function humanize(str: string): string {
  const words = str.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Group knowledge chunks by title.
 * Returns one entry per unique title with aggregated chunk count.
 */
export function groupChunksByTitle(
  chunks: Array<{ id: string; title: string | null; sourceType: string; chunkIndex: number; createdAt: Date | string | null }>,
): Array<{ key: string; title: string | null; sourceType: string; chunkCount: number; createdAt: Date | string | null }> {
  const map = new Map<
    string,
    { key: string; title: string | null; sourceType: string; chunkCount: number; createdAt: Date | string | null }
  >();

  for (const row of chunks) {
    const key = row.title ?? row.id;
    const existing = map.get(key);
    if (existing) {
      existing.chunkCount++;
    } else {
      map.set(key, {
        key,
        title: row.title,
        sourceType: row.sourceType,
        chunkCount: 1,
        createdAt: row.createdAt,
      });
    }
  }

  return [...map.values()];
}
