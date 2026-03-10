import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  externalId: text('external_id').notNull(),
  channel: text('channel').notNull(),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  metadata: jsonb('metadata').notNull().default({}),
  displayName: text('display_name'),
  memory: jsonb('memory').notNull().default({}),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('customers_tenant_channel_external_idx').on(table.tenantId, table.channel, table.externalId),
]);
