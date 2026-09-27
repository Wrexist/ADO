import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { executionLocks, runs } from '../db/schema';
import { Runner } from './index';
import type { Spawner } from './spawner';

const tick = () => new Promise((r) => setTimeout(r, 20));
const spawner: Spawner = { spawn: () => ({ lines: (async function* () {})(), done: Promise.resolve(0), kill() {} }) };
describe('durable execution', () => {
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
