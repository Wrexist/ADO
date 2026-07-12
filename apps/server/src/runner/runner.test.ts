import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { runs } from '../db/schema';
import { parseStreamLine } from './adapter';
import { Runner } from './index';
import type { SpawnHandle, SpawnOpts, Spawner } from './spawner';

describe('stream-json adapter (council B5)', () => {
  it('normalizes known line shapes', () => {
    expect(parseStreamLine('{"type":"system","subtype":"init"}')).toEqual([{ kind: 'started' }]);
    expect(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]}}')).toEqual([{ kind: 'tool', name: 'Edit' }]);
    const done = parseStreamLine('{"type":"result","subtype":"success","num_turns":3,"usage":{"input_tokens":100,"output_tokens":50}}');
    expect(done[0]).toMatchObject({ kind: 'done', ok: true, tokensIn: 100, tokensOut: 50, turns: 3 });
  });

  it('degrades unknown/garbled lines to opaque — never throws', () => {
    expect(parseStreamLine('{"type":"quantum_flux_v9"}')).toEqual([{ kind: 'opaque' }]);
    expect(parseStreamLine('not json at all')).toEqual([{ kind: 'opaque' }]);
    expect(parseStreamLine('')).toEqual([]);
  });
});

/** Fake spawner: yields scripted stream-json lines, then exits with `code`. */
function fakeSpawner(lines: string[], code = 0): Spawner {
  return {
    spawn(_opts: SpawnOpts): SpawnHandle {
      async function* gen() {
        for (const l of lines) yield l;
      }
      return { lines: gen(), done: Promise.resolve(code), kill: () => {} };
    },
  };
}

const SUCCESS_STREAM = [
  '{"type":"system","subtype":"init"}',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Reading the code"}]}}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]}}',
  '{"type":"result","subtype":"success","num_turns":2,"usage":{"input_tokens":1200,"output_tokens":340}}',
];

const cwdFor = (id: string) => (id === 'sentinel' ? '/repos/sentinel' : null);

async function drain(): Promise<void> {
  // let the runner's async run loop settle
  await new Promise((r) => setTimeout(r, 20));
}

describe('runner (Prompts 3.1–3.2)', () => {
  it('dispatches, streams live events, and logs the run to completion', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const runner = new Runner(bus, db, fakeSpawner(SUCCESS_STREAM), { cwdFor });

    const { runId } = runner.dispatch({ repoId: 'sentinel', task: 'fix the flaky test' });
    await drain();

    const row = db.select().from(runs).where(eq(runs.id, runId)).get()!;
    expect(row.status).toBe('done');
    expect(row.tokensIn).toBe(1200);
    expect(row.tokensOut).toBe(340);
    expect(row.exitCode).toBe(0);

    // live bus effects: an agent, a finished build, activity, and repo avatar tag
    const s = bus.snapshot().state;
    expect(s.agents[runId]?.status).toBe('done');
    expect(s.builds[runId]?.state).toBe('success');
    expect(s.activity.some((a) => a.detail.includes('completed'))).toBe(true);
    sqlite.close();
  });

  it('rejects a dispatch whose repo is not in the cwd allow-list (council S12/cwd)', () => {
    const { db, sqlite } = openDb(':memory:');
    const runner = new Runner(new Bus(db), db, fakeSpawner([]), { cwdFor });
    expect(() => runner.dispatch({ repoId: 'evil', task: 'rm -rf' })).toThrow(/allow-list/);
    sqlite.close();
  });

  it('a mutated/unknown stream still finishes and logs (opaque, no crash)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const runner = new Runner(bus, db, fakeSpawner(['{"type":"totally_new_shape","x":1}', 'garbage']), { cwdFor });
    const { runId } = runner.dispatch({ repoId: 'sentinel', task: 'x' });
    await drain();
    const row = db.select().from(runs).where(eq(runs.id, runId)).get()!;
    expect(row.status).toBe('done'); // exit 0 despite opaque stream — never crashed
    expect(row.note).toBe('opaque stream'); // flagged as opaque, honest
    sqlite.close();
  });

  it('a failed exit marks the run + build failed', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const runner = new Runner(bus, db, fakeSpawner(['{"type":"system","subtype":"init"}'], 1), { cwdFor });
    const { runId } = runner.dispatch({ repoId: 'sentinel', task: 'x' });
    await drain();
    expect(db.select().from(runs).where(eq(runs.id, runId)).get()!.status).toBe('failed');
    expect(bus.snapshot().state.builds[runId]?.state).toBe('failed');
    sqlite.close();
  });

  it('semaphore queues dispatches beyond maxConcurrent', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    // never-resolving spawn so slots stay occupied
    const stuck: Spawner = { spawn: () => ({ lines: (async function* () {})(), done: new Promise<number>(() => {}), kill: () => {} }) };
    const runner = new Runner(bus, db, stuck, { cwdFor, maxConcurrent: 1 });
    runner.dispatch({ repoId: 'sentinel', task: 'a' });
    const second = runner.dispatch({ repoId: 'sentinel', task: 'b' });
    // second stays queued in the build queue (honest), not spawned
    expect(bus.snapshot().state.builds[second.runId]?.state).toBe('queued');
    runner.stop();
    sqlite.close();
  });

  it('reconciles orphaned running AND queued rows to failed on boot', () => {
    const { db, sqlite } = openDb(':memory:');
    db.insert(runs).values({ id: 'r-old', repoId: 'sentinel', task: 'x', model: 'default', status: 'running', startedTs: '2026-07-09T00:00:00.000Z' }).run();
    // a queued row's in-memory queue is gone on restart — it must be reconciled too
    db.insert(runs).values({ id: 'q-old', repoId: 'sentinel', task: 'y', model: 'default', status: 'queued', startedTs: '2026-07-09T00:00:00.000Z' }).run();
    const runner = new Runner(new Bus(db), db, fakeSpawner([]), { cwdFor });
    expect(runner.reconcileOrphans()).toBe(2);
    expect(db.select().from(runs).where(eq(runs.id, 'r-old')).get()!.status).toBe('failed');
    expect(db.select().from(runs).where(eq(runs.id, 'q-old')).get()!.status).toBe('failed');
    sqlite.close();
  });

  it('a throw inside run() releases the slot and drains the queue (no wedge)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    // First spawn throws; the second works. With maxConcurrent=1, the second only runs
    // if the failed first correctly released its slot (the old code leaked it forever).
    let calls = 0;
    const flaky: Spawner = {
      spawn(): SpawnHandle {
        calls++;
        if (calls === 1) throw new Error('spawn boom');
        async function* gen() { for (const l of SUCCESS_STREAM) yield l; }
        return { lines: gen(), done: Promise.resolve(0), kill: () => {} };
      },
    };
    const runner = new Runner(bus, db, flaky, { cwdFor, maxConcurrent: 1 });

    const a = runner.dispatch({ repoId: 'sentinel', task: 'a' });
    await drain();
    expect(db.select().from(runs).where(eq(runs.id, a.runId)).get()!.status).toBe('failed'); // spawn threw

    const b = runner.dispatch({ repoId: 'sentinel', task: 'b' });
    await drain();
    expect(db.select().from(runs).where(eq(runs.id, b.runId)).get()!.status).toBe('done'); // slot was free
    sqlite.close();
  });
});
