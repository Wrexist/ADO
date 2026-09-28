import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';
import { inspectProfileDatabase } from './inspection';
import { writeRestoreGuard } from '../backup/restoreGuard';

it('refuses incomplete migrations without completing them, accepts the real upgrade read-only and detects lost guards', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-inspection-')), path = join(root, 'profile.sqlite');
  const full = resolve('apps/server/drizzle'), old = join(root, 'old'); mkdirSync(join(old, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(full, 'meta/_journal.json'), 'utf8'));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < 20);
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) copyFileSync(join(full, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
  const db = new Database(path);
  migrate(drizzle(db), { migrationsFolder: old }); db.close();
  const before = readFileSync(path);
  expect(() => inspectProfileDatabase(path, full)).toThrow('migration ledger');
  expect(readFileSync(path)).toEqual(before);
  const upgraded = new Database(path); migrate(drizzle(upgraded), { migrationsFolder: full }); upgraded.close();
  const completed = readFileSync(path), inspected = inspectProfileDatabase(path, full);
  try { expect(() => inspected.exec('CREATE TABLE forbidden(id TEXT)')).toThrow(/readonly/i); }
  finally { inspected.close(); }
  expect(readFileSync(path)).toEqual(completed);
  writeRestoreGuard(path, { restoreId: '11111111-1111-4111-8111-111111111111', databaseSha256: 'a'.repeat(64), restoredAt: '2026-09-28T00:00:00.000Z' });
  expect(() => inspectProfileDatabase(path, full)).toThrow('schema differs');
  const restoredBytes = readFileSync(path), restored = inspectProfileDatabase(path, full, { restored: true }); restored.close();
  expect(readFileSync(path)).toEqual(restoredBytes);
  const damaged = new Database(path); damaged.exec('DROP TRIGGER execution_context_no_update'); damaged.close();
  const damagedBytes = readFileSync(path);
  expect(() => inspectProfileDatabase(path, full, { restored: true })).toThrow('schema differs');
  expect(readFileSync(path)).toEqual(damagedBytes);
  const absent = join(root, 'absent.sqlite');
  expect(() => inspectProfileDatabase(absent, full)).toThrow(); expect(existsSync(absent)).toBe(false);
});
