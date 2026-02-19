import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '@camello/db/schema';

const { Pool } = pg;

/**
 * Service-role database pool that bypasses RLS.
 * Used ONLY for cross-tenant operations in background jobs:
 * - Tenant enumeration (SELECT DISTINCT tenant_id FROM ...)
 * - Atomic queue claim on knowledge_syncs (FOR UPDATE SKIP LOCKED)
 *
 * All tenant-scoped reads/writes MUST use createTenantDb(tenantId) instead.
 */
const servicePool = new Pool({
  connectionString: process.env.DATABASE_URL_SERVICE_ROLE,
  max: 5,
});

export const serviceDb = drizzle(servicePool, { schema });
export type ServiceDb = NodePgDatabase<typeof schema>;

export { servicePool };
