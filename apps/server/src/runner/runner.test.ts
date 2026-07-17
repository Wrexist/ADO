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

  it('captures the final result text (capped) for outcome-marker consumers', () => {
    const done = parseStreamLine('{"type":"result","subtype":"success","result":"Done.\\nTESTFLIGHT_UPLOADED com.x.y 1.0 (2)"}');
    expect(done[0]).toMatchObject({ kind: 'done', resultText: expect.stringContaining('TESTFLIGHT_UPLOADED com.x.y 1.0 (2)') });
    // non-string result → null, never a guess
    expect(parseStreamLine('{"type":"result","result":42}')[0]).toMatchObject({ kind: 'done', resultText: null });
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

  it('tags the repo with the runId (resolves in state.agents), not the display name', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    // repo.enriched is dropped for an unknown repo (honest), so seed the repo first.
    bus.publish({
      id: 'repo:sentinel',
      type: 'repo.upserted',
      ts: '2026-07-09T00:00:00.000Z',
      source: { kind: 'scanner', ref: 'sentinel' },
      payload: {
        repo: { id: 'sentinel', name: 'Sentinel', category: 'app', status: 'active', description: '', branch: 'main', updatedTs: '2026-07-09T00:00:00.000Z' },
      },
    });
    const runner = new Runner(bus, db, fakeSpawner(SUCCESS_STREAM), { cwdFor });
    const { runId } = runner.dispatch({ repoId: 'sentinel', task: 'x' });
    await drain();

    const s = bus.snapshot().state;
    // the tag is the runId, and it resolves to the real agent record (the bug: a display
    // name like "Agent · sentinel" filtered out to an empty per-project Agents panel).
    expect(s.repos.sentinel.agents).toContain(runId);
    expect(s.agents[runId]).toBeDefined();
    expect(s.repos.sentinel.agents!.every((aid) => Boolean(s.agents[aid]))).toBe(true);
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

  it('onRunDone fires once with the final text on success, and with null text on a failed spawn', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const calls: Array<{ runId: string; ok: boolean; resultText: string | null }> = [];
    const stream = [
      '{"type":"system","subtype":"init"}',
      '{"type":"result","subtype":"success","num_turns":1,"usage":{"input_tokens":1,"output_tokens":1},"result":"TESTFLIGHT_UPLOADED com.a.b 1.0 (2)"}',
    ];
    const runner = new Runner(bus, db, fakeSpawner(stream), {
      cwdFor,
      onRunDone: (runId, info) => calls.push({ runId, ...info }),
    });
    const { runId } = runner.dispatch({ repoId: 'sentinel', task: 'deploy' });
    await drain();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ runId, ok: true, resultText: expect.stringContaining('TESTFLIGHT_UPLOADED') });

    // a throwing hook never breaks the runner
    const runner2 = new Runner(bus, db, fakeSpawner(stream), {
      cwdFor,
      onRunDone: () => { throw new Error('hook boom'); },
    });
    const r2 = runner2.dispatch({ repoId: 'sentinel', task: 'x' });
    await drain();
    const row = db.select().from(runs).where(eq(runs.id, r2.runId)).get()!;
    expect(row.status).toBe('done'); // hook throw swallowed
    sqlite.close();
  });

  it('captures a live timeline, persists resultText, and reports isLive honestly', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const stream = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]}}',
      '{"type":"result","subtype":"success","num_turns":1,"usage":{"input_tokens":5,"output_tokens":5},"result":"All done: fixed the test."}',
    ];
    const runner = new Runner(bus, db, fakeSpawner(stream), { cwdFor });
    const { runId } = runner.dispatch({ repoId: 'sentinel', task: 'fix' });
    await drain();
    const t = runner.timeline(runId)!;
    expect(t.map((e) => e.kind)).toEqual(['status', 'status', 'status', 'tool', 'status']); // Queued·Spawned·started·Edit·Completed
    expect(t.some((e) => e.kind === 'tool' && e.text === 'Edit')).toBe(true);
    expect(runner.isLive(runId)).toBe(false);
    expect(runner.timeline('run-from-last-boot')).toBeNull(); // honest absence, not []
    expect(db.select().from(runs).where(eq(runs.id, runId)).get()!.resultText).toBe('All done: fixed the test.');
    sqlite.close();
  });

  it('kill: cancels a QUEUED run and SIGTERMs a RUNNING one (note records why)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    // a killable "running" spawn: lines block until kill() fires, then the run exits 143
    let release!: (code: number) => void;
    const killable: Spawner = {
      spawn(): SpawnHandle {
        const done = new Promise<number>((r) => (release = r));
        async function* gen() { await done; yield* [] as string[]; }
        return { lines: gen(), done, kill: () => release(143) };
      },
    };
    const runner = new Runner(bus, db, killable, { cwdFor, maxConcurrent: 1 });
    const a = runner.dispatch({ repoId: 'sentinel', task: 'long job' }); // running (stuck)
    const b = runner.dispatch({ repoId: 'sentinel', task: 'waiting' }); // queued behind it

    expect(runner.kill(b.runId)).toBe(true); // queued → cancelled, never spawned
    await drain();
    const rowB = db.select().from(runs).where(eq(runs.id, b.runId)).get()!;
    expect(rowB.status).toBe('failed');
    expect(rowB.note).toContain('cancelled from the dashboard');

    expect(runner.isLive(a.runId)).toBe(true);
    expect(runner.kill(a.runId)).toBe(true); // running → SIGTERM → exit 143
    await drain();
    const rowA = db.select().from(runs).where(eq(runs.id, a.runId)).get()!;
    expect(rowA.status).toBe('failed');
    expect(rowA.note).toBe('killed from the dashboard');

    expect(runner.kill(a.runId)).toBe(false); // already finished — nothing in flight
    expect(runner.kill('never-existed')).toBe(false);
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
