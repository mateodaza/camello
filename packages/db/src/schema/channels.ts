import { pgTable, uuid, text, jsonb, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const channelConfigs = pgTable('channel_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  channelType: text('channel_type').notNull(),
  credentials: jsonb('credentials').notNull().default({}), // encrypted at app level (AES-256-GCM)
  webhookUrl: text('webhook_url'),
  phoneNumber: text('phone_number'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('channel_configs_tenant_type_idx').on(table.tenantId, table.channelType),
]);

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  channelType: text('channel_type').notNull(),
  externalId: text('external_id').notNull(),
  payload: jsonb('payload').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('webhook_events_tenant_channel_external_idx').on(table.tenantId, table.channelType, table.externalId),
  index('idx_webhook_events_unprocessed').on(table.tenantId, table.channelType),
]);
