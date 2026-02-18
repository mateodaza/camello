import { pgTable, uuid, text, integer, numeric, date, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  resolutionsCount: integer('resolutions_count').notNull().default(0),
  llmCostUsd: numeric('llm_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  overageCostUsd: numeric('overage_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('usage_records_tenant_period_idx').on(table.tenantId, table.periodStart),
]);

export const billingEvents = pgTable('billing_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  amountUsd: numeric('amount_usd', { precision: 10, scale: 4 }),
  stripeEventId: text('stripe_event_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
