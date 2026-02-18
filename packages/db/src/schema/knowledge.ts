import { pgTable, uuid, text, jsonb, integer, timestamp, index, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants.js';

// Custom pgvector type
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

// Custom tsvector type for full-text search generated column
const tsvector = customType<{ data: string; driverName: 'tsvector' }>({
  dataType() {
    return 'tsvector';
  },
});

export const knowledgeDocs = pgTable('knowledge_docs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  title: text('title'),
  content: text('content').notNull(),
  sourceType: text('source_type').notNull().default('upload'),
  chunkIndex: integer('chunk_index').notNull().default(0),
  metadata: jsonb('metadata').notNull().default({}),
  embedding: vector('embedding'),
  // Generated column: fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || content)) STORED
  // Drizzle doesn't natively support GENERATED ALWAYS — actual constraint lives in migration SQL.
  // Declared here so Drizzle introspection won't drop it.
  fts: tsvector('fts'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
}, (table) => [
  // HNSW index for vector similarity search
  index('idx_knowledge_docs_embedding').using('hnsw', sql`${table.embedding} vector_cosine_ops`),
  // GIN index for full-text search
  index('idx_knowledge_docs_fts').using('gin', table.fts),
]);

export const knowledgeSyncs = pgTable('knowledge_syncs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  sourceUrl: text('source_url').notNull(),
  sourceType: text('source_type').notNull().default('website'),
  lastSynced: timestamp('last_synced', { withTimezone: true, mode: 'date' }),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});
