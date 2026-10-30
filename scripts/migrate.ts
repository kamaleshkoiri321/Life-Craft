import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

import { neon } from '@neondatabase/serverless';
import { getDatabaseUrl } from '../lib/db';

/**
 * Explicit SQL migration runner for LifeCraft Phase 3.
 *
 * Applies tracked SQL files from `./drizzle/*.sql` in alphabetical order
 * and records applied migrations in `public.__lifecraft_migrations`.
 * Never touches the `neon_auth` schema.
 */

function splitSqlStatements(sqlContent: string): string[] {
  const withoutComments = sqlContent
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutComments
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

export async function runMigrations(): Promise<{
  applied: string[];
  skipped: string[];
}> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not configured. Add your Neon PostgreSQL connection string to DATABASE_URL before running migrations.'
    );
  }

  const sqlClient = neon(databaseUrl);

  await sqlClient`
    CREATE TABLE IF NOT EXISTS "public"."__lifecraft_migrations" (
      "filename" text PRIMARY KEY NOT NULL,
      "applied_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  const existingRows = (await sqlClient`
    SELECT "filename" FROM "public"."__lifecraft_migrations" ORDER BY "filename" ASC
  `) as Array<{ filename: string }>;
  const appliedSet = new Set(existingRows.map((r) => r.filename));

  const drizzleDir = path.join(process.cwd(), 'drizzle');
  const entries = await fs.readdir(drizzleDir);
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const filename of sqlFiles) {
    if (appliedSet.has(filename)) {
      skipped.push(filename);
      continue;
    }

    const fullPath = path.join(drizzleDir, filename);
    const content = await fs.readFile(fullPath, 'utf8');
    const statements = splitSqlStatements(content);

    for (const statement of statements) {
      await sqlClient.query(statement);
    }

    await sqlClient`
      INSERT INTO "public"."__lifecraft_migrations" ("filename")
      VALUES (${filename})
      ON CONFLICT ("filename") DO NOTHING
    `;
    applied.push(filename);
  }

  return { applied, skipped };
}

if (require.main === module) {
  runMigrations()
    .then(({ applied, skipped }) => {
      console.log(
        `[LifeCraft Migrate] Applied: ${
          applied.length ? applied.join(', ') : 'none'
        } | Already up-to-date: ${
          skipped.length ? skipped.join(', ') : 'none'
        }`
      );
    })
    .catch((err) => {
      console.error('[LifeCraft Migrate] Migration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
