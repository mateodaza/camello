import { pgTable, uuid, text, jsonb, boolean, timestamp, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Global catalog — no tenant_id, no RLS.
// All tenants read the same module definitions.
export const modules = pgTable('modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  inputSchema: jsonb('input_schema').notNull(),
  outputSchema: jsonb('output_schema').notNull(),
  category: text('category').notNull(),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (_table) => [
  check('modules_category_values', sql`category IN ('sales', 'support', 'marketing', 'operations', 'custom')`),
]);
