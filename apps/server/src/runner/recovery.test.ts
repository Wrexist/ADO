import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { executionLocks, runs } from '../db/schema';
import { Runner } from './index';
import type { Spawner } from './spawner';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tick = () => new Promise((r) => setTimeout(r, 20));
const spawner: Spawner = { spawn: () => ({ lines: (async function* () {})(), done: Promise.resolve(0), kill() {} }) };
describe('durable execution', () => {
  it('keeps an accepted job queued when its atomic claim event cannot be stored', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    let starts = 0;
    const runner = new Runner(bus, db, { spawn: (opts) => { starts++; return spawner.spawn(opts); } }, { cwdFor: (id) => `/repos/${id}` });
    try {
      sqlite.exec("CREATE TRIGGER reject_claim BEFORE INSERT ON events WHEN NEW.type = 'build.updated' AND json_extract(NEW.payload, '$.build.state') = 'running' BEGIN SELECT RAISE(ABORT, 'injected claim failure'); END");
      const first = runner.dispatch({ repoId: 'a', task: 'accepted' });
      expect(runner.isLive(first.runId)).toBe(true);
      expect(db.select().from(runs).all()[0].status).toBe('queued');
      expect(db.select().from(executionLocks).all()).toHaveLength(0);
      expect(starts).toBe(0);
      sqlite.exec('DROP TRIGGER reject_claim');
      runner.dispatch({ repoId: 'b', task: 'wake queue' });
      await tick();
      expect(starts).toBe(2);
      expect(db.select().from(runs).all().map((r) => r.status)).toEqual(['done', 'done']);
    } finally { await runner.stop(); sqlite.close(); }
  });

  it('retains the writer lock when neither success nor failure can be committed', async () => {
    const { db, sqlite } = openDb(':memory:');
    const runner = new Runner(new Bus(db), db, spawner, { cwdFor: () => '/repos/a' });
    try {
      sqlite.exec("CREATE TRIGGER reject_terminal BEFORE INSERT ON events WHEN NEW.type = 'build.updated' AND json_extract(NEW.payload, '$.build.state') IN ('success', 'failed') BEGIN SELECT RAISE(ABORT, 'injected terminal failure'); END");
      runner.dispatch({ repoId: 'a', task: 'first' });
      await tick();
      runner.dispatch({ repoId: 'a', task: 'must wait' });
      expect(db.select().from(runs).all().map((r) => r.status)).toEqual(['running', 'queued']);
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
    } finally { await runner.stop(); sqlite.close(); }
  });

  it.each([false, true])('quarantines a rejected process outcome across restart (stop throws: %s)', async (stopThrows) => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-exit-'));
    const path = join(root, 'profile.sqlite');
    let connection = openDb(path);
    let calls = 0;
    let kills = 0;
    const uncertain: Spawner = { spawn() {
      calls++;
      return {
        lines: (async function* () {})(),
        done: Promise.reject(new Error('exit observation lost')),
        kill() { kills++; if (stopThrows) throw new Error('stop failed'); },
      };
    } };
    let runner = new Runner(new Bus(connection.db), connection.db, uncertain, { cwdFor: (id) => join(root, id), maxConcurrent: 1 });
    try {
      const first = runner.dispatch({ repoId: 'a', task: 'uncertain writer' });
      runner.dispatch({ repoId: 'a', task: 'must wait' });
      await tick();
      expect(calls).toBe(1);
      expect(kills).toBe(1);
      const rows = connection.db.select().from(runs).all();
      expect(rows.map((r) => r.status)).toEqual(['failed', 'queued']);
      expect(rows[0].note).toContain('process outcome unknown; writer lock retained');
      expect(connection.db.select().from(executionLocks).all().map((l) => l.runId)).toEqual([first.runId]);
      await runner.stop();
      connection.sqlite.close();
      connection = openDb(path);
      runner = new Runner(new Bus(connection.db), connection.db, spawner, { cwdFor: (id) => join(root, id), maxConcurrent: 1 });
      runner.reconcileOrphans();
      runner.dispatch({ repoId: 'a', task: 'still blocked after restart' });
      runner.dispatch({ repoId: 'b', task: 'independent' });
      await tick();
      expect(connection.db.select().from(runs).all().slice(-2).map((r) => r.status)).toEqual(['queued', 'done']);
      expect(connection.db.select().from(executionLocks).all().map((l) => l.runId)).toEqual([first.runId]);
    } finally {
      await runner.stop();
      connection.sqlite.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('restores a committed queued job once after restart', async () => {
    const { db, sqlite } = openDb(':memory:');
    db.insert(runs).values({ id: 'persisted', repoId: 'a', task: 'x', model: 'default', status: 'queued', startedTs: new Date().toISOString(), engineVersion: 1 }).run();
    const runner = new Runner(new Bus(db), db, spawner, { cwdFor: () => '/repos/a' });
    runner.reconcileOrphans(); await tick();
    expect(db.select().from(runs).all()[0].status).toBe('done');
    expect(runner.reconcileOrphans()).toBe(0);
    expect(db.select().from(executionLocks).all()).toHaveLength(0);
    await runner.stop(); sqlite.close();
  });
  it('persists unknown stop after a crash before process identity was written', async () => {
    const { db, sqlite } = openDb(':memory:');
    const ts = new Date().toISOString();
    db.insert(runs).values({ id: 'pre-identity', repoId: 'a', task: 'interrupted', model: 'default', status: 'running', startedTs: ts, engineVersion: 1 }).run();
    db.insert(executionLocks).values({ resource: 'old-resource', runId: 'pre-identity', owner: 'previous-owner', acquiredTs: ts }).run();
    const runner = new Runner(new Bus(db), db, { spawn() { throw new Error('Interrupted attempts must never be retried'); } }, { cwdFor: () => '/repos/a' });
    try {
      expect(runner.reconcileOrphans()).toBe(1);
      expect(db.select().from(runs).get()).toMatchObject({ status: 'failed', processIdentity: null, processTermination: 'unconfirmed' });
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
      expect(runner.reconcileRun('pre-identity')).toBe(false);
    } finally { await runner.stop(); sqlite.close(); }
  });
  it('retains an uncertain writer lock and lets unrelated repos proceed', async () => {
    const { db, sqlite } = openDb(':memory:');
    const root = process.platform === 'win32' ? 'c:/repos/a' : '/repos/a';
    const runner = new Runner(new Bus(db), db, spawner, { cwdFor: (id) => id === 'a' ? root : '/repos/b' });
    // The same canonical resource spelling used by the current host.
    const { resolve } = await import('node:path');
    db.insert(executionLocks).values({ resource: process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root), runId: 'old', owner: 'previous-boot', acquiredTs: new Date().toISOString() }).run();
    runner.dispatch({ repoId: 'a', task: 'must wait' });
    runner.dispatch({ repoId: 'b', task: 'independent' }); await tick();
    expect(db.select().from(runs).all().map((r) => r.status)).toEqual(['queued', 'done']);
    await runner.stop(); expect(db.select().from(executionLocks).all()).toHaveLength(1); sqlite.close();
  });
  it('deduplicates requests and rejects reuse for changed content', async () => {
    const { db, sqlite } = openDb(':memory:');
    const runner = new Runner(new Bus(db), db, spawner, { cwdFor: () => '/repos/a' });
    const input = { repoId: 'a', task: 'x', idempotencyKey: 'request-1' };
    expect(runner.dispatch(input)).toEqual(runner.dispatch(input));
    expect(() => runner.dispatch({ ...input, task: 'changed' })).toThrow(/conflict/);
    await tick(); expect(db.select().from(runs).all()).toHaveLength(1); await runner.stop(); sqlite.close();
  });
});
