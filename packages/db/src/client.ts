import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

// Connection pool — shared across the application
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections in pool
});

// Service-role pool — bypasses RLS for cross-tenant operations (internal/ops routes)
const servicePool = new Pool({
  connectionString: process.env.DATABASE_URL_SERVICE_ROLE,
});

export const db = drizzle(pool, { schema });

export { pool, servicePool };
export type Database = typeof db;
