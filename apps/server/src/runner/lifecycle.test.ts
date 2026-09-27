import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { executionLocks, runs } from '../db/schema';
import { Runner } from './index';
import type { Spawner } from './spawner';

const tick = () => new Promise((r) => setTimeout(r, 10));
function harness(timeoutMs = 1000) {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  const processes: Array<{ exit: (code: number) => void; kills: number }> = [];
  const spawner: Spawner = { spawn() {
    let exit!: (code: number) => void;
    const done = new Promise<number>((resolve) => { exit = resolve; });
    const process = { exit, kills: 0 }; processes.push(process);
    return { lines: (async function* () {})(), done, kill: () => { process.kills++; exit(0); } };
  } };
  let blocked = false;
  const runner = new Runner(bus, db, spawner, { cwdFor: (id) => `/repos/${id}`, blockedReason: () => blocked ? 'disabled' : null, timeoutMs });
  return { runner, db, sqlite, bus, processes, disable: () => { blocked = true; } };
}
describe('runner lifecycle regressions', () => {
  it('keeps the writer lock after a stream error until process exit is observed', async () => {
    const { db, sqlite } = openDb(':memory:');
    let exit!: (code: number) => void;
    let kills = 0;
    let calls = 0;
    const runner = new Runner(new Bus(db), db, { spawn() {
      calls++;
      if (calls > 1) return { lines: (async function* () {})(), done: Promise.resolve(0), kill() {} };
      return {
        lines: (async function* () { yield ''; throw new Error('stream failed'); })(),
        done: new Promise<number>((resolve) => { exit = resolve; }),
        kill() { kills++; },
      };
    } }, { cwdFor: () => '/repos/a' });
    try {
      runner.dispatch({ repoId: 'a', task: 'first' });
      runner.dispatch({ repoId: 'a', task: 'queued' });
      await tick();
      expect(kills).toBe(1);
      expect(calls).toBe(1);
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
      exit(1);
      await tick();
      expect(calls).toBe(2);
      expect(db.select().from(runs).all().map((r) => r.status)).toEqual(['failed', 'done']);
      expect(db.select().from(executionLocks).all()).toHaveLength(0);
    } finally { exit(1); await runner.stop(); sqlite.close(); }
  });

  it('serializes writers and rechecks policy before draining', async () => {
    const h = harness(); h.runner.dispatch({ repoId: 'a', task: 'first' }); h.runner.dispatch({ repoId: 'a', task: 'queued' });
    expect(h.processes).toHaveLength(1); h.disable(); h.processes[0].exit(0); await tick();
    expect(h.processes).toHaveLength(1);
    expect(h.db.select().from(runs).all().map((r) => r.status)).toEqual(['done', 'failed']);
    await h.runner.stop(); h.sqlite.close();
  });
  it('shutdown preserves queued work, waits for active work and rejects new dispatch', async () => {
    const h = harness(); h.runner.dispatch({ repoId: 'a', task: 'first' }); h.runner.dispatch({ repoId: 'a', task: 'queued' });
    await h.runner.stop(); expect(h.processes).toHaveLength(1);
    expect(h.db.select().from(runs).all().map((r) => ({ task: r.task, status: r.status }))).toEqual([{ task: 'first', status: 'failed' }, { task: 'queued', status: 'queued' }]);
    expect(() => h.runner.dispatch({ repoId: 'a', task: 'late' })).toThrow(/stopping/); h.sqlite.close();
  });
  it('retains a kill handle after stdout EOF; exit zero after cancellation is failure', async () => {
    const h = harness(); const { runId } = h.runner.dispatch({ repoId: 'a', task: 'x' }); await tick();
    expect(h.runner.isLive(runId)).toBe(true); expect(h.runner.kill(runId)).toBe(true); await tick();
    expect(h.db.select().from(runs).all()[0].status).toBe('failed'); await h.runner.stop(); h.sqlite.close();
  });
  it('keeps wall-clock timeout after stdout EOF', async () => {
    const h = harness(15); h.runner.dispatch({ repoId: 'a', task: 'x' }); await new Promise((r) => setTimeout(r, 40));
    expect(h.processes[0].kills).toBe(1); expect(h.db.select().from(runs).all()[0].note).toBe('wall-clock timeout');
    await h.runner.stop(); h.sqlite.close();
  });
  it('does not turn structured agent failure into success via exit zero', async () => {
    const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
    const runner = new Runner(bus, db, { spawn: () => ({ lines: (async function* () { yield '{"type":"result","is_error":true}'; })(), done: Promise.resolve(0), kill() {} }) }, { cwdFor: () => '/repos/a' });
    runner.dispatch({ repoId: 'a', task: 'x' }); await tick();
    expect(db.select().from(runs).all()[0].status).toBe('failed'); await runner.stop(); sqlite.close();
  });
});
