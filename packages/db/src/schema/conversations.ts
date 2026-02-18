import { pgTable, uuid, text, jsonb, integer, numeric, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { artifacts } from './artifacts.js';
import { customers } from './customers.js';
import { modules } from './modules.js';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  channel: text('channel').notNull(),
  status: text('status').notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_conversations_tenant_status').on(table.tenantId, table.status, table.updatedAt),
  check('conversations_status_values', sql`status IN ('active', 'resolved', 'escalated')`),
]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  channelMessageId: text('channel_message_id'),
  tokensUsed: integer('tokens_used'),
  modelUsed: text('model_used'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_messages_tenant_conv').on(table.tenantId, table.conversationId, table.createdAt),
  check('messages_role_values', sql`role IN ('customer', 'artifact', 'human', 'system')`),
]);

export const moduleExecutions = pgTable('module_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  moduleId: uuid('module_id').notNull().references(() => modules.id),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  status: text('status').notNull().default('pending'),
  approvedBy: text('approved_by'),
  executedAt: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_module_executions_pending').on(table.tenantId, table.status),
  check('module_executions_status_values', sql`status IN ('pending', 'approved', 'rejected', 'executed', 'failed')`),
]);

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  score: text('score').notNull(),
  tags: text('tags').array().notNull().default([]),
  budget: text('budget'),
  timeline: text('timeline'),
  summary: text('summary'),
  qualifiedAt: timestamp('qualified_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_leads_tenant_score').on(table.tenantId, table.score, table.createdAt),
  check('leads_score_values', sql`score IN ('hot', 'warm', 'cold')`),
]);
