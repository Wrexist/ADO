/**
 * DB bootstrap: better-sqlite3 in WAL mode + drizzle migrations applied on open.
 * WAL means the nightly backup must use VACUUM INTO, never a raw file copy (B5).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

// Migrations ship beside the source in dev; a packaged app (desktop bundle) relocates them
// and points here via ACC_MIGRATIONS_DIR — resolved lazily so the env override always wins.
const migrationsDir = (): string =>
  process.env.ACC_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export function openDb(dbPath: string): { db: Db; sqlite: Database.Database } {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir() });
  return { db, sqlite };
}
