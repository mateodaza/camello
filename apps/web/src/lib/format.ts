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
export function fmtCost(value: string | number): string {
  return `$${Number(value).toFixed(4)}`;
}

/** Format a numeric USD value as $X.XXXXXX (6 decimal places, for per-interaction). */
export function fmtMicroCost(value: string | number): string {
  return `$${Number(value).toFixed(6)}`;
}

/** Format an integer with locale separators (e.g. 1,234). */
export function fmtInt(value: number): string {
  return value.toLocaleString();
}

/** Format a Date or date-string to a short local date (e.g. "2/19/2026"). */
export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

/** Format a Date or date-string to a short local datetime (e.g. "2/19/2026, 5:30 PM"). */
export function fmtDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

/** Truncate a string to maxLen chars, appending "…" if truncated. */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
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
