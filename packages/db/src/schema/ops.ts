import { pgTable, uuid, text, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

/** Job execution ledger — no RLS (operational, not tenant-scoped). */
export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobName: text('job_name').notNull(),
  period: text('period').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  result: jsonb('result'),
}, (table) => [
  unique('job_runs_name_period_idx').on(table.jobName, table.period),
]);
