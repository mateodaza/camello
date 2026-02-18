import { pgTable, pgEnum, uuid, text, jsonb, boolean, integer, timestamp, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { modules } from './modules.js';

export const autonomyLevelEnum = pgEnum('autonomy_level', ['suggest_only', 'draft_and_approve', 'fully_autonomous']);

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  personality: jsonb('personality').notNull().default({}),
  constraints: jsonb('constraints').notNull().default({}),
  config: jsonb('config').notNull().default({}),
  escalation: jsonb('escalation').notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  check('artifacts_type_values', sql`type IN ('sales', 'support', 'marketing', 'custom')`),
]);

export const artifactModules = pgTable('artifact_modules', {
  id: uuid('id').primaryKey().defaultRandom(),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  moduleId: uuid('module_id').notNull().references(() => modules.id, { onDelete: 'restrict' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  autonomyLevel: autonomyLevelEnum('autonomy_level').notNull().default('draft_and_approve'),
  configOverrides: jsonb('config_overrides').notNull().default({}),
}, (table) => [
  uniqueIndex('artifact_modules_artifact_module_idx').on(table.artifactId, table.moduleId),
]);
