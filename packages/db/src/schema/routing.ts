import { pgTable, uuid, text, integer, boolean, jsonb, numeric, date, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { artifacts } from './artifacts.js';
import { conversations } from './conversations.js';

// === ARTIFACT ROUTING RULES ===
// Tenant-level deterministic routing rules.
// Resolver evaluates active rules ordered by priority ASC (lower number = higher priority).
// If no rule matches, fallback is tenants.default_artifact_id.

export const artifactRoutingRules = pgTable('artifact_routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  channel: text('channel'),                                    // NULL = any channel
  intent: text('intent'),                                      // NULL = any intent
  minConfidence: numeric('min_confidence', { precision: 3, scale: 2 }).notNull().default('0.00'),
  priority: integer('priority').notNull().default(100),         // lower value = higher priority
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  index('idx_artifact_routing_lookup').on(table.tenantId, table.isActive, table.channel, table.intent, table.priority),
  check('min_confidence_range', sql`min_confidence >= 0 AND min_confidence <= 1`),
]);

// === CONVERSATION ARTIFACT ASSIGNMENTS ===
// Artifact ownership timeline per conversation.
// This is the source of truth for routing/handoffs over time.
// Hard invariant: only ONE active assignment per conversation at any time.

export const conversationArtifactAssignments = pgTable('conversation_artifact_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id),
  assignmentReason: text('assignment_reason').notNull(),
  triggerIntent: text('trigger_intent'),
  triggerConfidence: numeric('trigger_confidence', { precision: 3, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  metadata: jsonb('metadata').notNull().default({}),
}, (table) => [
  // Hard invariant: only one active artifact per conversation
  uniqueIndex('idx_assignments_single_active_per_conversation')
    .on(table.conversationId)
    .where(sql`is_active = true AND ended_at IS NULL`),
  index('idx_assignments_tenant_artifact_started').on(table.tenantId, table.artifactId, table.startedAt),
  check('assignment_reason_values', sql`assignment_reason IN ('route_rule', 'tenant_default_fallback', 'manual_override', 'handoff')`),
  check('trigger_confidence_range', sql`trigger_confidence IS NULL OR (trigger_confidence >= 0 AND trigger_confidence <= 1)`),
  check('active_ended_consistency', sql`(is_active = true AND ended_at IS NULL) OR (is_active = false AND ended_at IS NOT NULL)`),
]);

// === ARTIFACT METRICS DAILY ===
// Rollup table for dashboard agent-performance cards (MVP analytics granularity: daily).

export const artifactMetricsDaily = pgTable('artifact_metrics_daily', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  artifactId: uuid('artifact_id').notNull().references(() => artifacts.id, { onDelete: 'cascade' }),
  metricDate: date('metric_date').notNull(),
  handoffsIn: integer('handoffs_in').notNull().default(0),
  handoffsOut: integer('handoffs_out').notNull().default(0),
  resolutionsCount: integer('resolutions_count').notNull().default(0),
  avgLatencyMs: numeric('avg_latency_ms', { precision: 10, scale: 2 }).notNull().default('0'),
  llmCostUsd: numeric('llm_cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_artifact_metrics_daily_tenant_artifact_date')
    .on(table.tenantId, table.artifactId, table.metricDate),
]);
