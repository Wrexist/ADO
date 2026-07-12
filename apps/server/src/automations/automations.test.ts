import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isScheduleDue, eventMatches, type AutomationInputT } from '@ado/shared';
import { buildServer, type AccServer } from '../app';
import { AutomationStore } from './store';
import { AutomationEngine, type DispatchFn } from './engine';

const freshStore = () => new AutomationStore(join(tmpdir(), `acc-autos-test-${randomUUID()}.json`));
const base = (over: Partial<AutomationInputT> = {}): AutomationInputT => ({
  repoId: 'r1', name: 'A', task: 'do the thing', trigger: { on: 'manual' }, enabled: true, ...over,
});

describe('schedule + event helpers', () => {
  it('isScheduleDue: never-run is due; within interval is not; past interval is', () => {
    const t = { on: 'schedule', every: 'day' } as const;
    expect(isScheduleDue(t, null, 1_000)).toBe(true);
    expect(isScheduleDue(t, 1_000, 1_000 + 60_000)).toBe(false);
    expect(isScheduleDue(t, 1_000, 1_000 + 25 * 60 * 60 * 1000)).toBe(true);
    expect(isScheduleDue({ on: 'manual' }, null, 1)).toBe(false);
  });
  it('eventMatches only for a matching event trigger', () => {
    expect(eventMatches({ on: 'event', event: 'build.failed' }, 'build.failed')).toBe(true);
    expect(eventMatches({ on: 'event', event: 'build.success' }, 'build.failed')).toBe(false);
    expect(eventMatches({ on: 'manual' }, 'build.failed')).toBe(false);
  });
});

describe('AutomationStore', () => {
  it('creates, updates by id, lists, and removes', () => {
    const s = freshStore();
    const a = s.upsert(base({ name: 'One' }));
    expect(a.id).toBeTruthy();
    expect(a.createdTs).toBeTruthy();
    expect(a.lastRunTs).toBeNull();
    const updated = s.upsert({ ...base({ name: 'One v2' }), id: a.id });
    expect(updated.id).toBe(a.id); // same id → update
    expect(updated.name).toBe('One v2');
    expect(s.list()).toHaveLength(1);
    expect(s.remove(a.id)).toBe(true);
    expect(s.list()).toHaveLength(0);
  });
  it('rejects invalid input (empty task)', () => {
    expect(() => freshStore().upsert(base({ task: '' }))).toThrow();
  });
});

describe('AutomationEngine', () => {
  const makeEngine = (nowRef: { t: number }) => {
    const calls: { repoId: string; task: string }[] = [];
    let seq = 0;
    const dispatch: DispatchFn = (repoId, task) => {
      calls.push({ repoId, task });
      return { runId: `run-${++seq}` };
    };
    const store = freshStore();
    const engine = new AutomationEngine(store, dispatch, () => {}, () => nowRef.t);
    return { store, engine, calls };
  };

  it('runNow dispatches, marks the run, and throws on unknown id', () => {
    const now = { t: 1_000 };
    const { store, engine, calls } = makeEngine(now);
    const a = store.upsert(base({ task: 'run me' }));
    const { runId } = engine.runNow(a.id);
    expect(calls).toEqual([{ repoId: 'r1', task: 'run me' }]);
    expect(store.get(a.id)?.lastRunId).toBe(runId);
    expect(() => engine.runNow('nope')).toThrow(/unknown/);
  });

  it('onBuildEvent fires only matching, enabled event automations for that repo', () => {
    const now = { t: 1_000 };
    const { store, engine, calls } = makeEngine(now);
    store.upsert(base({ name: 'onFail', repoId: 'r1', trigger: { on: 'event', event: 'build.failed' } }));
    store.upsert(base({ name: 'onSuccess', repoId: 'r1', trigger: { on: 'event', event: 'build.success' } }));
    store.upsert(base({ name: 'otherRepo', repoId: 'r2', trigger: { on: 'event', event: 'build.failed' } }));
    store.upsert(base({ name: 'manual', repoId: 'r1', trigger: { on: 'manual' } }));
    store.upsert(base({ name: 'disabled', repoId: 'r1', enabled: false, trigger: { on: 'event', event: 'build.failed' } }));

    engine.onBuildEvent('r1', 'build.failed');
    expect(calls).toHaveLength(1); // only the enabled r1 build.failed one
  });

  it('debounces: the same automation does not refire within the window', () => {
    const now = { t: 1_000 };
    const { store, engine, calls } = makeEngine(now);
    store.upsert(base({ repoId: 'r1', trigger: { on: 'event', event: 'build.failed' } }));
    engine.onBuildEvent('r1', 'build.failed');
    engine.onBuildEvent('r1', 'build.failed'); // immediately again → debounced
    expect(calls).toHaveLength(1);
    now.t += 3 * 60 * 1000; // past the 2-min debounce
    engine.onBuildEvent('r1', 'build.failed');
    expect(calls).toHaveLength(2);
  });

  it('tickScheduled fires due scheduled automations only', () => {
    const now = { t: 10 * 24 * 60 * 60 * 1000 };
    const { store, engine, calls } = makeEngine(now);
    store.upsert(base({ name: 'daily', trigger: { on: 'schedule', every: 'day' } })); // never run → due
    store.upsert(base({ name: 'manual', trigger: { on: 'manual' } }));
    engine.tickScheduled();
    expect(calls).toHaveLength(1);
    engine.tickScheduled(); // just ran → not due again
    expect(calls).toHaveLength(1);
  });

  it('a dispatch that throws (repo not dispatchable) is caught on event/schedule paths', () => {
    const store = freshStore();
    const engine = new AutomationEngine(store, () => { throw new Error('not in allow-list'); }, () => {}, () => 1);
    store.upsert(base({ trigger: { on: 'event', event: 'build.failed' } }));
    expect(() => engine.onBuildEvent('r1', 'build.failed')).not.toThrow();
  });
});

describe('automations endpoints', () => {
  const ENV = { port: 8790, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
  const HOST = { host: '127.0.0.1:8790' };
  const AUTH = { ...HOST, 'x-acc-token': 'test-token' };
  let srv: AccServer;
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('GET /api/automations is token-gated', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/automations', headers: HOST })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'GET', url: '/api/automations', headers: AUTH })).statusCode).toBe(200);
  });

  it('POST creates, POST bad → 400, DELETE unknown → 404', async () => {
    const create = await srv.app.inject({ method: 'POST', url: '/api/automations', headers: AUTH, payload: base({ name: 'CI fix' }) });
    expect(create.statusCode).toBe(200);
    expect(create.json().automation.id).toBeTruthy();
    expect((await srv.app.inject({ method: 'POST', url: '/api/automations', headers: AUTH, payload: { name: 'x' } })).statusCode).toBe(400);
    expect((await srv.app.inject({ method: 'DELETE', url: '/api/automations/nope', headers: AUTH })).statusCode).toBe(404);
  });

  it('POST /:id/run on a non-dispatchable repo → 400 (honest failure, not a fake run)', async () => {
    const create = await srv.app.inject({ method: 'POST', url: '/api/automations', headers: AUTH, payload: base({ repoId: 'ghost-repo' }) });
    const id = create.json().automation.id as string;
    const run = await srv.app.inject({ method: 'POST', url: `/api/automations/${id}/run`, headers: AUTH });
    expect(run.statusCode).toBe(400); // ghost-repo isn't in the scanner allow-list
  });
});
