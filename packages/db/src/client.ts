import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

// Connection pool — shared across the application
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections in pool
});

// Service-role pool — bypasses RLS.
// ONLY for use in apps/api/src/lib/service-pool.ts and apps/jobs/src/lib/service-db.ts.
// Never import directly into tenant-scoped handlers or shared packages.
const servicePool = new Pool({
  connectionString: process.env.DATABASE_URL_SERVICE_ROLE,
});

export const db = drizzle(pool, { schema });

export { pool, servicePool };
export type Database = typeof db;
