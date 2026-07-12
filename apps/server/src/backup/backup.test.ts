import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { events } from '../db/schema';
import { backupDatabase } from './index';

let dir: string;
const newDb = () => {
  dir = mkdtempSync(join(tmpdir(), 'acc-backup-'));
  const { db, sqlite } = openDb(join(dir, 'acc.sqlite'));
  return { db, sqlite };
};
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

let uid = 0;
const seed = (db: ReturnType<typeof openDb>['db'], n: number) => {
  for (let i = 0; i < n; i++) {
    db.insert(events)
      .values({ id: `e${uid++}`, type: 'app.opened', ts: '2026-07-12T00:00:00.000Z', sourceKind: 'app', sourceRef: 's', payload: '{}' })
      .run();
  }
};

describe('WAL-safe backup (P6 / B5)', () => {
  it('writes a consistent copy whose row count matches the source', () => {
    const { db, sqlite } = newDb();
    seed(db, 12);
    const backupDir = join(dir, 'backups');

    const r = backupDatabase(sqlite, backupDir, { stamp: 'snap1' });
    expect(r.rows).toBe(12);
    expect(existsSync(r.file)).toBe(true);

    // Reopen the copy independently and confirm the events survived intact.
    const copy = new Database(r.file, { readonly: true });
    const n = (copy.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n;
    copy.close();
    expect(n).toBe(12);
    sqlite.close();
  });

  it('rotates to the newest N copies', () => {
    const { db, sqlite } = newDb();
    seed(db, 3);
    const backupDir = join(dir, 'backups');

    const stamps = ['t1', 't2', 't3', 't4', 't5'];
    let last;
    for (const stamp of stamps) last = backupDatabase(sqlite, backupDir, { stamp, keep: 3 });

    const files = readdirSync(backupDir).filter((f) => f.endsWith('.sqlite')).sort();
    expect(files).toEqual(['acc-t3.sqlite', 'acc-t4.sqlite', 'acc-t5.sqlite']); // oldest two gone
    expect(last?.rotatedOut).toEqual(['acc-t2.sqlite']); // the 5th write evicts the 2nd-oldest
    sqlite.close();
  });

  it('overwrites a same-stamp target instead of failing (VACUUM INTO needs a free path)', () => {
    const { db, sqlite } = newDb();
    seed(db, 5);
    const backupDir = join(dir, 'backups');
    backupDatabase(sqlite, backupDir, { stamp: 'dup' });
    seed(db, 2); // now 7 events
    const r = backupDatabase(sqlite, backupDir, { stamp: 'dup' });
    expect(r.rows).toBe(7);
    sqlite.close();
  });
});
