import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { executionLocks, runs } from '../db/schema';
import { executionCapacityAvailable } from './executionCapacity';

it('preserves an over-capacity old profile and enforces shared capacity through independent database connections', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-capacity-migration-'));
  const previous = process.env.ACC_MIGRATIONS_DIR;
  let connection: ReturnType<typeof openDb> | undefined, other: ReturnType<typeof openDb> | undefined;
  try {
    const source = fileURLToPath(new URL('../../drizzle/', import.meta.url)), old = join(root, 'migrations');
    mkdirSync(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx < 16);
    writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
    process.env.ACC_MIGRATIONS_DIR = old;
    const path = join(root, 'profile.sqlite'); connection = openDb(path);
    const ts = new Date().toISOString();
    for (const id of ['a', 'b', 'c', 'd']) connection.db.insert(runs).values({ id, repoId: id, task: id, model: 'default', status: 'failed', startedTs: ts, processTermination: 'unconfirmed' }).run();
    const lock = (id: string) => ({ resource: id, runId: id, owner: id === 'b' ? 'verify:old' : 'old-owner', acquiredTs: ts });
    for (const id of ['a', 'b', 'c']) connection.db.insert(executionLocks).values(lock(id)).run();
    const before = connection.db.select().from(executionLocks).all();
    connection.sqlite.close(); connection = undefined;
    process.env.ACC_MIGRATIONS_DIR = source;
    connection = openDb(path); other = openDb(path);
    expect(connection.db.select().from(executionLocks).all()).toEqual(before);
    expect(executionCapacityAvailable(other.db)).toBe(false);
    const claim = () => other!.db.transaction((tx) => {
      tx.update(runs).set({ status: 'running' }).where(eq(runs.id, 'd')).run();
      tx.insert(executionLocks).values(lock('d')).run();
    });
    expect(claim).toThrow('Execution capacity');
    expect(other.db.select().from(runs).where(eq(runs.id, 'd')).get()?.status).toBe('failed');
    // Direct fixture deletion models confirmed release; no product unlock path is added.
    connection.db.delete(executionLocks).where(eq(executionLocks.resource, 'a')).run();
    expect(claim).toThrow('Execution capacity');
    connection.db.delete(executionLocks).where(eq(executionLocks.resource, 'c')).run();
    expect(executionCapacityAvailable(other.db)).toBe(true); claim();
    expect(connection.db.select().from(executionLocks).all().map((row) => row.resource).sort()).toEqual(['b', 'd']);
  } finally {
    other?.sqlite.close(); connection?.sqlite.close();
    if (previous === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

it('allows only one of two processes to claim the last slot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-capacity-race-')), path = join(root, 'profile.sqlite');
  const { db, sqlite } = openDb(path), ts = new Date().toISOString();
  const children: ReturnType<typeof spawn>[] = [], completions: Promise<number | null>[] = [];
  try {
    for (const id of ['a', 'b', 'c']) db.insert(runs).values({ id, repoId: id, task: id, model: 'default', status: 'queued', startedTs: ts }).run();
    db.insert(executionLocks).values({ resource: 'a', runId: 'a', owner: 'quarantine', acquiredTs: ts }).run();
    let ready = 0;
    for (const id of ['b', 'c']) {
      const code = `import {openDb} from ${JSON.stringify(new URL('../db/index.ts', import.meta.url).href)};
        const {sqlite}=openDb(${JSON.stringify(path)});console.log('ready');
        process.stdin.once('data',()=>{let result=0;try{sqlite.transaction(()=>{
          sqlite.prepare("UPDATE runs SET status='running' WHERE id=?").run(${JSON.stringify(id)});
          sqlite.prepare('INSERT INTO execution_locks(resource,run_id,owner,acquired_ts) VALUES(?,?,?,?)').run(${JSON.stringify(id)},${JSON.stringify(id)},'racing-owner',${JSON.stringify(ts)});
        })();}catch{result=3}finally{sqlite.close()}process.exit(result)});`;
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { windowsHide: true, stdio: 'pipe' });
      children.push(child); completions.push(new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }));
      child.stderr!.resume(); child.stdout!.once('data', () => { ready++; });
    }
    await expect.poll(() => ready, { timeout: 15000 }).toBe(2);
    for (const child of children) child.stdin!.end('claim');
    expect((await Promise.all(completions)).sort()).toEqual([0, 3]);
    expect(db.select().from(executionLocks).all()).toHaveLength(2);
    expect(db.select().from(runs).all().filter((run) => run.status === 'running')).toHaveLength(1);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    await Promise.allSettled(completions); sqlite.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 30000);
