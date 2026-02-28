import { pgTable, uuid, text, jsonb, integer, numeric, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
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
  moduleSlug: text('module_slug').notNull(),
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
  index('idx_module_executions_slug').on(table.tenantId, table.moduleSlug, table.status, table.createdAt),
  check('module_executions_status_values', sql`status IN ('pending', 'approved', 'rejected', 'executed', 'failed')`),
]);

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  score: text('score').notNull(),
  stage: text('stage').notNull().default('new'),
  estimatedValue: numeric('estimated_value', { precision: 12, scale: 2 }),
  tags: text('tags').array().notNull().default([]),
  budget: text('budget'),
  timeline: text('timeline'),
  summary: text('summary'),
  closeReason: text('close_reason'),
  qualifiedAt: timestamp('qualified_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_leads_tenant_score').on(table.tenantId, table.score, table.createdAt),
  index('idx_leads_tenant_stage').on(table.tenantId, table.stage, table.score, table.createdAt),
  // One-lead-per-conversation invariant: salesQuotes, payment prefill, and after-hours
  // attribution all assume at most one lead per conversation_id.
  uniqueIndex('idx_leads_conversation_unique').on(table.conversationId).where(sql`conversation_id IS NOT NULL`),
  check('leads_score_values', sql`score IN ('hot', 'warm', 'cold')`),
  check('leads_stage_values', sql`stage IN ('new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost')`),
]);

// artifact_id is the immutable ownership key (set once, never re-derived).
// lead_id and conversation_id are provenance only (mutable via handoffs).
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
  conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  quoteExecutionId: uuid('quote_execution_id').references(() => moduleExecutions.id, { onDelete: 'set null' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('USD'),
  description: text('description'),
  paymentUrl: text('payment_url'),
  status: text('status').notNull().default('pending'),
  dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
  paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
  reference: text('reference'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_payments_artifact_status').on(table.artifactId, table.status, table.createdAt),
  index('idx_payments_tenant_status').on(table.tenantId, table.status, table.createdAt),
  check('payments_status_values', sql`status IN ('pending','sent','viewed','paid','overdue','cancelled')`),
  check('payments_amount_positive', sql`amount > 0`),
]);
