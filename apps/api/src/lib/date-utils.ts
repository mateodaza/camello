/**
 * Compute UTC month boundaries for a given date.
 * Used by both budget gate (message-handler) and analytics (monthlyUsage)
 * to ensure consistent month windows.
 */
export function getUtcMonthWindow(date: Date): { monthStart: Date; nextMonthStart: Date } {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { monthStart, nextMonthStart };
}
