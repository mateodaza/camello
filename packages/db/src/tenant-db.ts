import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import { pool } from './client.js';

// --- Types ---

/** Drizzle client bound to a specific connection with tenant context. */
export type TenantDrizzle = NodePgDatabase<typeof schema>;

/** Drizzle transaction object (same API as TenantDrizzle but inside BEGIN/COMMIT). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TenantTransaction = Parameters<Parameters<TenantDrizzle['transaction']>[0]>[0];

export interface TenantDb {
  /**
   * Execute queries within tenant context.
   * Acquires connection → set_config(session-level) → runs fn → RESET → releases.
   * No connection pinning — each call is independent.
   */
  query<T>(fn: (db: TenantDrizzle) => Promise<T>): Promise<T>;

  /**
   * Execute an atomic transaction within tenant context.
   * Acquires connection → BEGIN → set_config(transaction-local) → fn → COMMIT → releases.
   */
  transaction<T>(fn: (tx: TenantTransaction) => Promise<T>): Promise<T>;

  /** The tenant ID this instance is scoped to. */
  readonly tenantId: string;
}

// UUID v4 regex — validates that tenantId is a proper UUID before touching the DB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a tenant-scoped database helper.
 *
 * Each `query()` or `transaction()` call acquires a connection from the pool,
 * sets the RLS context (`app.tenant_id`), executes, resets, and releases.
 * No connection is held between calls — safe for streaming routes.
 *
 * @see TECHNICAL_SPEC_v1.md Section 7 — Multi-Tenant Strategy
 */
export function createTenantDb(tenantId: string): TenantDb {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    throw new Error(`Invalid tenant ID: ${tenantId}`);
  }

  return {
    async query<T>(fn: (db: TenantDrizzle) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      try {
        // set_config(..., false) = session-level: persists for all statements
        // on this connection until RESET or disconnect.
        // Safe because we always RESET in finally before releasing to pool.
        await conn.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
        const db = drizzle(conn, { schema });
        return await fn(db);
      } finally {
        // Clear tenant context before returning connection to pool.
        // Prevents cross-tenant leaks if pool reuses the connection.
        await conn.query(`RESET app.tenant_id`);
        conn.release();
      }
    },

    async transaction<T>(fn: (tx: TenantTransaction) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      try {
        const db = drizzle(conn, { schema });
        return await db.transaction(async (tx) => {
          // set_config(..., true) = transaction-local: scoped exactly to
          // this BEGIN/COMMIT block, auto-clears on commit/rollback.
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
          return fn(tx);
        });
      } finally {
        conn.release();
      }
    },

    tenantId,
  };
}
