/**
 * WAL-safe database backup (P6 / db-index B5). Under WAL a raw file copy misses the
 * write-ahead log and can restore corrupt, so we use `VACUUM INTO` — SQLite writes a
 * fully-checkpointed, consistent snapshot to a fresh file. We then reopen the copy and
 * assert its row count matches the source (a silent short-write must fail loudly), and
 * rotate to the newest N copies so backups don't grow without bound.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const KEEP_DEFAULT = 7;
const CONFIG_FILES = ['connections.json', 'prompts.json', 'project-dirs.json', 'project-settings.json', 'automations.json', 'autoreview.json', 'testflight.json'];

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
  opts: { keep?: number; stamp?: string; dataDir?: string } = {},
): BackupResult {
  const keep = opts.keep ?? KEEP_DEFAULT;
  mkdirSync(backupDir, { recursive: true });

  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  if (!/^[\w-]+$/.test(stamp)) throw new Error('Invalid backup stamp');
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

  if (opts.dataDir) {
    const files: Record<string, string> = {};
    for (const name of CONFIG_FILES) {
      const path = join(opts.dataDir, name);
      if (existsSync(path)) { const raw = readFileSync(path, 'utf8'); JSON.parse(raw); files[name] = raw; }
    }
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    writeFileSync(`${file}.json`, JSON.stringify({ version: 1, databaseSha256: digest, files }), { mode: 0o600 });
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
    rmSync(join(backupDir, `${old}.json`), { force: true });
    rotatedOut.push(old);
  }

  return { file, rows: srcRows, rotatedOut };
}

/** Restore to a NEW profile only. Existing profiles are never overwritten. */
export function restoreBackup(file: string, destination: string): void {
  if (existsSync(destination)) throw new Error('Restore destination must not exist');
  const manifest = JSON.parse(readFileSync(`${file}.json`, 'utf8')) as { version?: number; databaseSha256?: string; files?: Record<string, unknown> };
  if (manifest.version !== 1 || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) throw new Error('Invalid backup manifest');
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== manifest.databaseSha256) throw new Error('Backup database checksum mismatch');
  for (const [name, raw] of Object.entries(manifest.files)) {
    if (!CONFIG_FILES.includes(name) || typeof raw !== 'string') throw new Error('Invalid backup configuration');
    JSON.parse(raw);
  }
  const db = new Database(file, { readonly: true });
  try { if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Backup database integrity check failed'); }
  finally { db.close(); }
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  copyFileSync(file, join(destination, 'acc.sqlite'));
  for (const [name, raw] of Object.entries(manifest.files)) writeFileSync(join(destination, name), raw as string, { flag: 'wx', mode: 0o600 });
}
