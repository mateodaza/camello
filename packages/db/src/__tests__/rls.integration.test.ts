/**
 * RLS Integration Tests — Cross-Tenant Isolation
 *
 * Tests the core security property: tenant A cannot access tenant B's data,
 * and no tenant context = no data (fail-closed).
 *
 * Requires: local Supabase running (`npx supabase start`)
 * Run: pnpm --filter @camello/db test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
// Local Supabase Postgres (from `supabase start`)
const PG_CONFIG = {
  host: '127.0.0.1',
  port: 54322,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
};

// Test UUIDs (deterministic for easy assertion)
const TENANT_A_ID = '00000000-0000-0000-0000-00000000000a';
const TENANT_B_ID = '00000000-0000-0000-0000-00000000000b';

let adminPool: pg.Pool;

// --- Helpers ---

/** Execute SQL as the postgres superuser (for setup/teardown). */
async function adminQuery(sql: string, params?: unknown[]) {
  return adminPool.query(sql, params);
}

/** Execute SQL as app_user with a specific tenant context. */
async function tenantQuery(tenantId: string | null, sql: string, params?: unknown[]) {
  const conn = await adminPool.connect();
  try {
    await conn.query('SET ROLE app_user');
    if (tenantId) {
      await conn.query(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    }
    const result = await conn.query(sql, params);
    return result;
  } finally {
    await conn.query('RESET ROLE');
    await conn.query('RESET app.tenant_id');
    conn.release();
  }
}

/** Count rows visible to app_user under a given tenant context. */
async function countAs(tenantId: string | null, table: string): Promise<number> {
  const result = await tenantQuery(tenantId, `SELECT count(*)::int AS n FROM ${table}`);
  return result.rows[0].n;
}

// --- Setup & Teardown ---

const PSQL_URI = `postgresql://${PG_CONFIG.user}:${PG_CONFIG.password}@${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`;

beforeAll(async () => {
  // 1. Apply migration via psql subprocess (large multi-statement SQL
  //    crashes node-pg pooled connections in Supabase local PG 17).
  //    Run BEFORE creating the pool — DROP SCHEMA CASCADE invalidates
  //    existing pooled connections.
  const migrationPath = join(__dirname, '../../migrations/0001_initial_schema.sql');
  execFileSync('psql', [
    PSQL_URI,
    '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;',
    '-f', migrationPath,
  ], { stdio: 'pipe' });

  // 2. Grant app_user for SET ROLE via psql (postgres is NOT superuser
  //    in Supabase local, and `GRANT ... TO current_user` crashes node-pg)
  execFileSync('psql', [
    PSQL_URI,
    '-c', 'GRANT app_user TO postgres',
    '-c', 'GRANT USAGE ON SCHEMA public TO app_user',
    '-c', 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user',
  ], { stdio: 'pipe' });

  // 3. Create pool after migration so connections see the fresh schema
  adminPool = new pg.Pool(PG_CONFIG);

  // 4. Seed two tenants with data
  await seedTestData();
}, 30_000);

afterAll(async () => {
  await adminPool.end();
});

async function seedTestData() {
  // Insert tenants (as superuser — bypasses RLS)
  await adminQuery(`
    INSERT INTO tenants (id, name, slug, plan_tier) VALUES
      ($1, 'Acme Corp', 'acme', 'starter'),
      ($2, 'Beta Inc', 'beta', 'growth')
  `, [TENANT_A_ID, TENANT_B_ID]);

  // Insert a global module (no tenant_id — global catalog)
  await adminQuery(`
    INSERT INTO modules (id, name, slug, description, input_schema, output_schema, category)
    VALUES (gen_random_uuid(), 'qualify_lead', 'qualify-lead', 'Qualify a lead', '{}', '{}', 'sales')
  `);

  // Insert artifacts for each tenant
  const artifactAId = '00000000-0000-0000-0000-0000000000a1';
  const artifactBId = '00000000-0000-0000-0000-0000000000b1';
  await adminQuery(`
    INSERT INTO artifacts (id, tenant_id, type, name) VALUES
      ($1, $2, 'sales', 'Alex'),
      ($3, $4, 'support', 'Sam')
  `, [artifactAId, TENANT_A_ID, artifactBId, TENANT_B_ID]);

  // Insert customers for each tenant
  const customerAId = '00000000-0000-0000-0000-0000000000a2';
  const customerBId = '00000000-0000-0000-0000-0000000000b2';
  await adminQuery(`
    INSERT INTO customers (id, tenant_id, external_id, channel) VALUES
      ($1, $2, '+1111111111', 'whatsapp'),
      ($3, $4, '+2222222222', 'whatsapp')
  `, [customerAId, TENANT_A_ID, customerBId, TENANT_B_ID]);

  // Insert conversations
  const convAId = '00000000-0000-0000-0000-0000000000a3';
  const convBId = '00000000-0000-0000-0000-0000000000b3';
  await adminQuery(`
    INSERT INTO conversations (id, tenant_id, artifact_id, customer_id, channel) VALUES
      ($1, $2, $3, $4, 'whatsapp'),
      ($5, $6, $7, $8, 'whatsapp')
  `, [convAId, TENANT_A_ID, artifactAId, customerAId, convBId, TENANT_B_ID, artifactBId, customerBId]);

  // Insert messages — 3 for tenant A, 2 for tenant B
  for (let i = 0; i < 3; i++) {
    await adminQuery(`
      INSERT INTO messages (tenant_id, conversation_id, role, content)
      VALUES ($1, $2, 'customer', $3)
    `, [TENANT_A_ID, convAId, `Message A-${i}`]);
  }
  for (let i = 0; i < 2; i++) {
    await adminQuery(`
      INSERT INTO messages (tenant_id, conversation_id, role, content)
      VALUES ($1, $2, 'customer', $3)
    `, [TENANT_B_ID, convBId, `Message B-${i}`]);
  }

  // Insert knowledge docs for tenant A only
  await adminQuery(`
    INSERT INTO knowledge_docs (tenant_id, title, content, source_type)
    VALUES ($1, 'Pricing FAQ', 'Our pricing starts at $99/mo', 'upload')
  `, [TENANT_A_ID]);
}

// --- Tests ---

describe('RLS: Cross-Tenant Isolation', () => {
  it('Tenant A sees only their own tenant record', async () => {
    const result = await tenantQuery(TENANT_A_ID, 'SELECT id, name FROM tenants');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Acme Corp');
  });

  it('Tenant B sees only their own tenant record', async () => {
    const result = await tenantQuery(TENANT_B_ID, 'SELECT id, name FROM tenants');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Beta Inc');
  });

  it('Tenant A sees only their artifacts', async () => {
    const result = await tenantQuery(TENANT_A_ID, 'SELECT name FROM artifacts');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Alex');
  });

  it('Tenant B cannot see Tenant A artifacts', async () => {
    const result = await tenantQuery(TENANT_B_ID, 'SELECT name FROM artifacts');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Sam');
  });

  it('Tenant A sees only their messages (3)', async () => {
    expect(await countAs(TENANT_A_ID, 'messages')).toBe(3);
  });

  it('Tenant B sees only their messages (2)', async () => {
    expect(await countAs(TENANT_B_ID, 'messages')).toBe(2);
  });

  it('Tenant A sees only their customers', async () => {
    const result = await tenantQuery(TENANT_A_ID, 'SELECT external_id FROM customers');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].external_id).toBe('+1111111111');
  });

  it('Tenant A sees only their conversations', async () => {
    expect(await countAs(TENANT_A_ID, 'conversations')).toBe(1);
  });

  it('Tenant A sees their knowledge docs, not Tenant B\'s', async () => {
    expect(await countAs(TENANT_A_ID, 'knowledge_docs')).toBe(1);
    expect(await countAs(TENANT_B_ID, 'knowledge_docs')).toBe(0);
  });
});

describe('RLS: Fail-Closed (No Tenant Context)', () => {
  it('No tenant_id set → tenants table returns 0 rows', async () => {
    expect(await countAs(null, 'tenants')).toBe(0);
  });

  it('No tenant_id set → artifacts table returns 0 rows', async () => {
    expect(await countAs(null, 'artifacts')).toBe(0);
  });

  it('No tenant_id set → messages table returns 0 rows', async () => {
    expect(await countAs(null, 'messages')).toBe(0);
  });

  it('No tenant_id set → customers table returns 0 rows', async () => {
    expect(await countAs(null, 'customers')).toBe(0);
  });

  it('No tenant_id set → conversations table returns 0 rows', async () => {
    expect(await countAs(null, 'conversations')).toBe(0);
  });

  it('No tenant_id set → knowledge_docs table returns 0 rows', async () => {
    expect(await countAs(null, 'knowledge_docs')).toBe(0);
  });
});

describe('RLS: Global Module Catalog', () => {
  it('Modules table is readable without tenant context (global catalog)', async () => {
    // modules has no RLS — accessible to everyone
    const result = await tenantQuery(null, 'SELECT name FROM modules');
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].name).toBe('qualify_lead');
  });

  it('Modules table is readable with any tenant context', async () => {
    const result = await tenantQuery(TENANT_A_ID, 'SELECT name FROM modules');
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('RLS: Write Isolation', () => {
  it('Tenant A cannot insert data with Tenant B\'s tenant_id', async () => {
    // When Tenant A tries to insert a customer with Tenant B's ID,
    // the WITH CHECK policy blocks it.
    await expect(
      tenantQuery(TENANT_A_ID, `
        INSERT INTO customers (tenant_id, external_id, channel)
        VALUES ($1, '+9999999999', 'webchat')
      `, [TENANT_B_ID])
    ).rejects.toThrow();
  });

  it('Tenant A can insert data with their own tenant_id', async () => {
    const result = await tenantQuery(TENANT_A_ID, `
      INSERT INTO customers (tenant_id, external_id, channel)
      VALUES ($1, '+3333333333', 'webchat')
      RETURNING id
    `, [TENANT_A_ID]);
    expect(result.rows).toHaveLength(1);
  });
});

describe('createTenantDb: Integration with RLS', () => {
  it('set_config pattern (used by createTenantDb) respects RLS', async () => {
    // Tests the exact set_config → query → RESET pattern that createTenantDb uses.
    // We test against the raw pool to validate the RLS mechanism itself.
    const conn = await adminPool.connect();
    try {
      await conn.query('SET ROLE app_user');
      await conn.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A_ID]);

      const result = await conn.query('SELECT name FROM tenants');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Acme Corp');

      // Reset and verify fail-closed
      await conn.query('RESET app.tenant_id');
      const empty = await conn.query('SELECT count(*)::int AS n FROM tenants');
      expect(empty.rows[0].n).toBe(0);
    } finally {
      await conn.query('RESET ROLE');
      conn.release();
    }
  });

  it('set_config + RESET cycle clears tenant context between queries', async () => {
    const conn = await adminPool.connect();
    try {
      await conn.query('SET ROLE app_user');

      // Query as Tenant A
      await conn.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_A_ID]);
      let result = await conn.query('SELECT name FROM tenants');
      expect(result.rows[0].name).toBe('Acme Corp');

      // RESET
      await conn.query('RESET app.tenant_id');

      // Query as Tenant B
      await conn.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT_B_ID]);
      result = await conn.query('SELECT name FROM tenants');
      expect(result.rows[0].name).toBe('Beta Inc');

      // Verify no leakage — Tenant B doesn't see Tenant A data
      const msgs = await conn.query('SELECT count(*)::int AS n FROM messages');
      expect(msgs.rows[0].n).toBe(2); // Only Tenant B's messages
    } finally {
      await conn.query('RESET ROLE');
      await conn.query('RESET app.tenant_id');
      conn.release();
    }
  });

  it('transaction-local set_config auto-clears after COMMIT', async () => {
    const conn = await adminPool.connect();
    try {
      await conn.query('SET ROLE app_user');

      // Begin transaction, set tenant context (transaction-local)
      await conn.query('BEGIN');
      await conn.query(`SELECT set_config('app.tenant_id', $1, true)`, [TENANT_A_ID]);
      let result = await conn.query('SELECT count(*)::int AS n FROM tenants');
      expect(result.rows[0].n).toBe(1);
      await conn.query('COMMIT');

      // After COMMIT, transaction-local setting is cleared → fail-closed
      result = await conn.query('SELECT count(*)::int AS n FROM tenants');
      expect(result.rows[0].n).toBe(0);
    } finally {
      await conn.query('RESET ROLE');
      conn.release();
    }
  });
});
