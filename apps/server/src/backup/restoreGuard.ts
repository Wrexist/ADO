import Database from 'better-sqlite3';
import { lstatSync } from 'node:fs';

export interface RestoreGuard { restoreId: string; databaseSha256: string; restoredAt: string }
export const restoreStagingFile = '.restore-in-progress.sqlite';

/** Profile metadata, independent of application schema migrations. Only restore/enrolment writes it. */
export function writeRestoreGuard(database: string, guard: RestoreGuard, replace = false) {
  const db = new Database(database, { fileMustExist: true });
  try {
    db.pragma('synchronous = FULL');
    db.transaction(() => {
      db.exec('CREATE TABLE IF NOT EXISTS controlos_restore_guard (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), restore_id TEXT NOT NULL, source_sha256 TEXT NOT NULL, restored_at TEXT NOT NULL)');
      if (replace) db.exec('DELETE FROM controlos_restore_guard');
      db.prepare('INSERT INTO controlos_restore_guard VALUES (1, ?, ?, ?)').run(guard.restoreId, guard.databaseSha256, guard.restoredAt);
    })();
  } finally { db.close(); }
}

export function readRestoreGuard(database: string): RestoreGuard | null {
  try { if (!lstatSync(database).isFile()) throw new Error('Invalid profile database'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const db = new Database(database, { readonly: true, fileMustExist: true });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='controlos_restore_guard'").get()) return null;
    const rows = db.prepare('SELECT restore_id AS restoreId, source_sha256 AS databaseSha256, restored_at AS restoredAt FROM controlos_restore_guard').all() as RestoreGuard[];
    if (rows.length !== 1 || !/^[a-f0-9-]{36}$/.test(rows[0].restoreId) || !/^[a-f0-9]{64}$/.test(rows[0].databaseSha256) || !rows[0].restoredAt) throw new Error('Invalid restoration database guard');
    return rows[0];
  } finally { db.close(); }
}
