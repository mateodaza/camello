import { pgTable, uuid, text, numeric, integer, timestamp, index, check, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { artifacts } from './artifacts.js';
import { conversations } from './conversations.js';

const vector = customType<{ data: number[]; driverName: 'vector' }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown) {
    if (typeof value === 'string') {
      return value.slice(1, -1).split(',').map(Number);
    }
    return value as number[];
  },
});

export const learnings = pgTable('learnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').references(() => artifacts.id),
  type: text('type').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding'),
  confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull().default('0.5'),
  sourceConversationId: uuid('source_conversation_id').references(() => conversations.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  check('learnings_type_values', sql`type IN ('preference', 'correction', 'pattern', 'objection')`),
  index('idx_learnings_embedding').using('hnsw', sql`${table.embedding} vector_cosine_ops`),
]);

export const interactionLogs = pgTable('interaction_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
  intent: text('intent').notNull(),
  modelUsed: text('model_used').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  resolutionType: text('resolution_type'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_interaction_logs_tenant_date').on(table.tenantId, table.createdAt),
]);
