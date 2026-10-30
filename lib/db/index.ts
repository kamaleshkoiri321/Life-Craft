import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Server-only Neon PostgreSQL database connection module.
 *
 * Uses `process.env.DATABASE_URL` strictly on the server.
 * Never import this module into client components or expose `DATABASE_URL`
 * via `NEXT_PUBLIC_` variables.
 */

export type LifeCraftDb = NeonHttpDatabase<typeof schema>;

let cachedDb: LifeCraftDb | null = null;
let cachedConnectionString: string | null = null;

export function getDatabaseUrl(): string | null {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw || raw === 'MY_DATABASE_URL' || raw.includes('<password>')) {
    return null;
  }
  return raw;
}

export function isDatabaseConfigured(): boolean {
  return getDatabaseUrl() !== null;
}

export function getDb(): LifeCraftDb {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not configured. Please add your Neon PostgreSQL connection string to DATABASE_URL in Google AI Studio Secrets.'
    );
  }

  if (cachedDb && cachedConnectionString === connectionString) {
    return cachedDb;
  }

  const sqlClient = neon(connectionString);
  cachedDb = drizzle(sqlClient, { schema });
  cachedConnectionString = connectionString;
  return cachedDb;
}

export { schema };
