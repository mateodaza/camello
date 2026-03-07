import { pgTable, uuid, text, jsonb, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { artifacts } from './artifacts.js';
import { leads } from './conversations.js';

export const ownerNotifications = pgTable('owner_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_notifications_artifact_unread').on(table.artifactId, table.createdAt),
  index('idx_notifications_artifact_all').on(table.artifactId, table.createdAt),
  // Note: idx_notifications_stale_dedup (partial unique index with expression column)
  // is defined in the SQL migration only — Drizzle schema DSL cannot express partial
  // unique indexes on expressions. ON CONFLICT DO NOTHING still respects it at runtime.
  check('owner_notifications_type_values', sql`type IN (
    'approval_needed', 'hot_lead', 'deal_closed', 'lead_stale', 'escalation', 'budget_warning', 'stage_advanced'
  )`),
]);
