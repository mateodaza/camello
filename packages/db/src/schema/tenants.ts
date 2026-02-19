import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex, check, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  businessModel: text('business_model'),
  industry: text('industry'),
  planTier: text('plan_tier').notNull().default('starter'),
  monthlyCostBudgetUsd: numeric('monthly_cost_budget_usd', { precision: 10, scale: 4 }),
  defaultArtifactId: uuid('default_artifact_id'), // Circular FK → artifacts(id) ON DELETE SET NULL. Cannot use .references() here (circular dep). Enforced in migration via ALTER TABLE tenants ADD CONSTRAINT tenants_default_artifact_fk.
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (_table) => [
  check('tenants_plan_tier_values', sql`plan_tier IN ('starter', 'growth', 'scale')`),
]);

export const tenantMembers = pgTable('tenant_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(), // Clerk user ID
  role: text('role').notNull().default('member'),
  invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('tenant_members_tenant_user_idx').on(table.tenantId, table.userId),
  check('tenant_members_role_values', sql`role IN ('owner', 'admin', 'member')`),
]);

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  keyHash: text('key_hash').notNull().unique(),
  label: text('label').notNull().default('default'),
  scopes: text('scopes').array().notNull().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
