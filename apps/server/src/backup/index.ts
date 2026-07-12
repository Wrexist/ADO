/**
 * WAL-safe database backup (P6 / db-index B5). Under WAL a raw file copy misses the
 * write-ahead log and can restore corrupt, so we use `VACUUM INTO` — SQLite writes a
 * fully-checkpointed, consistent snapshot to a fresh file. We then reopen the copy and
 * assert its row count matches the source (a silent short-write must fail loudly), and
 * rotate to the newest N copies so backups don't grow without bound.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const KEEP_DEFAULT = 7;

export interface BackupResult {
  file: string;
  rows: number;
  rotatedOut: string[];
}

function countEvents(db: Database.Database): number {
  return (db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n;
}

export function backupDatabase(
  sqlite: Database.Database,
  backupDir: string,
  opts: { keep?: number; stamp?: string } = {},
): BackupResult {
  const keep = opts.keep ?? KEEP_DEFAULT;
  mkdirSync(backupDir, { recursive: true });

  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(backupDir, `acc-${stamp}.sqlite`);
  if (existsSync(file)) rmSync(file); // VACUUM INTO requires a non-existent target

  const srcRows = countEvents(sqlite);
  sqlite.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);

  // Integrity assert: reopen the copy and compare. Fail loudly + delete a bad copy.
  const backup = new Database(file, { readonly: true });
  let bkRows: number;
  try {
    bkRows = countEvents(backup);
  } finally {
    backup.close();
  }
  if (bkRows !== srcRows) {
    rmSync(file);
    throw new Error(`backup integrity check failed: source has ${srcRows} events, backup has ${bkRows}`);
  }

  // Rotate — ISO-ish stamps sort chronologically, so drop the oldest beyond `keep`.
  const rotatedOut: string[] = [];
  const existing = readdirSync(backupDir)
    .filter((f) => f.startsWith('acc-') && f.endsWith('.sqlite'))
    .sort();
  while (existing.length > keep) {
    const old = existing.shift();
    if (!old) break;
    rmSync(join(backupDir, old));
    rotatedOut.push(old);
  }

  return { file, rows: srcRows, rotatedOut };
}
