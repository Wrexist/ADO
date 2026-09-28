import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';

/** Strict artifact-fixture inspection. Never migrates or repairs the inspected file.
 * The caller owns the returned read-only handle. Historical artifacts with different
 * migration bytes need their own expected manifest; this is not a production boot gate.
 */
export function inspectProfileDatabase(path: string, migrationsFolder: string, options: { restored?: boolean } = {}): Database.Database {
  const expected = new Database(':memory:');
  let observed: Database.Database | undefined;
  try {
    const migrations = readMigrationFiles({ migrationsFolder });
    // Only this separate in-memory reference receives migration writes.
    migrate(drizzle(expected), { migrationsFolder });
    // Restore metadata intentionally lives outside the migration journal. Opt in to
    // its exact known schema, never to a blanket allowance for extra tables.
    if (options.restored) expected.exec('CREATE TABLE controlos_restore_guard (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), restore_id TEXT NOT NULL, source_sha256 TEXT NOT NULL, restored_at TEXT NOT NULL)');
    observed = new Database(path, { readonly: true, fileMustExist: true });
    const ledger = observed.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at').all();
    assert.deepEqual(ledger, migrations.map(m => ({ hash: m.hash, created_at: m.folderMillis })), 'Observed migration ledger does not match the expected artifact');
    const schema = (db: Database.Database) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    assert.deepEqual(schema(observed), schema(expected), 'Observed schema differs from the expected migrations');
    assert.equal(observed.pragma('integrity_check', { simple: true }), 'ok', 'Observed database integrity failed');
    assert.deepEqual(observed.pragma('foreign_key_check'), [], 'Observed foreign keys failed');
    return observed;
  } catch (error) {
    observed?.close(); throw error;
  } finally { expected.close(); }
}
