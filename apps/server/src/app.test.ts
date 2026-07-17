import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AccServer } from './app';
import { buildServer } from './app';
import { Bus } from './bus';
import { openDb } from './db';
import type { SpawnHandle, SpawnOpts, Spawner } from './runner/spawner';

const ENV = {
  port: 8787,
  webOrigin: 'http://localhost:5173',
  accToken: 'test-token',
  dbPath: ':memory:',
  demo: false,
  projectDirs: [],
};

const HOST_OK = { host: '127.0.0.1:8787' };

describe('server security + bus (gate p2 criteria)', () => {
  let srv: AccServer;

  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('rejects requests with a foreign Host header — DNS-rebinding defense (S0)', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/health', headers: { host: 'evil.example:8787' } });
    expect(res.statusCode).toBe(403);
  });

  it('serves /health for allow-listed hosts', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/health', headers: HOST_OK });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('rejects mutating requests without X-ACC-Token', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/app-open', headers: HOST_OK, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('accepts app-open with the token and persists the event (p2.5 feed)', async () => {
    const res = await srv.app.inject({
      method: 'POST',
      url: '/api/app-open',
      headers: { ...HOST_OK, 'x-acc-token': 'test-token' },
      payload: { sessionId: 'sess-1' },
    });
    expect(res.statusCode).toBe(200);
    const opened = srv.bus.eventsSince(0).filter((e) => e.evt.type === 'app.opened');
    expect(opened.length).toBe(1);
  });

  it('refuses the SSE stream without a token (read-only ≠ public, S0)', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/events', headers: HOST_OK });
    expect(res.statusCode).toBe(401);
  });
});

describe('same-origin web serving (desktop / single-port mode)', () => {
  let srv: AccServer;
  let webDir: string;

  beforeAll(async () => {
    webDir = mkdtempSync(join(tmpdir(), 'acc-webdir-'));
    writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>acc</title>');
    mkdirSync(join(webDir, 'assets'));
    writeFileSync(join(webDir, 'assets', 'app.js'), 'console.log(1)');
    srv = await buildServer({ ...ENV, serveWebDir: webDir }, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
    rmSync(webDir, { recursive: true, force: true });
  });

  it('serves the bundle and falls back to index.html for client routes only', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/', headers: HOST_OK })).statusCode).toBe(200);
    expect((await srv.app.inject({ method: 'GET', url: '/assets/app.js', headers: HOST_OK })).body).toContain('console.log');
    // SPA fallback: an app route returns the shell…
    const spa = await srv.app.inject({ method: 'GET', url: '/agents', headers: HOST_OK });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('<!doctype html>');
    // …but API/SSE typos stay honest 404/401s, never HTML
    expect((await srv.app.inject({ method: 'GET', url: '/api/nope', headers: { ...HOST_OK, 'x-acc-token': 'test-token' } })).statusCode).toBe(404);
    expect((await srv.app.inject({ method: 'GET', url: '/events', headers: HOST_OK })).statusCode).toBe(401);
  });

  it('refuses to boot when the bundle is missing (build the web app first)', async () => {
    await expect(buildServer({ ...ENV, serveWebDir: join(webDir, 'nope') }, { startSystem: false })).rejects.toThrow(/does not exist/);
  });
});

describe('bus persistence + replay (event-sourced snapshot)', () => {
  it('replays the persisted log into an identical snapshot; duplicate ids are idempotent', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus1 = new Bus(db);

    const repoEvt = {
      id: 'e-repo-1',
      type: 'repo.upserted',
      ts: '2026-07-09T08:00:00.000Z',
      source: { kind: 'scanner', ref: 'test' },
      payload: {
        repo: {
          id: 'sentinel', name: 'SENTINEL', category: 'game', status: 'active',
          description: 'x', branch: 'main', updatedTs: '2026-07-09T08:00:00.000Z', agents: [],
        },
      },
    };
    expect(bus1.publish(repoEvt)).not.toBeNull();
    expect(bus1.publish(repoEvt)).toBeNull(); // same id → ignored, not re-broadcast

    // a second bus on the same db folds the log to the same state (boot path)
    const bus2 = new Bus(db);
    bus2.replayFromDb(() => {});
    expect(bus2.snapshot().state.repos.sentinel.name).toBe('SENTINEL');
    expect(bus2.snapshot().seq).toBe(bus1.snapshot().seq);
    sqlite.close();
  });

  it('rejects invalid payloads at the boundary (zod at both ends)', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    expect(() =>
      bus.publish({
        id: 'bad', type: 'repo.upserted', ts: 'not-a-date',
        source: { kind: 'scanner', ref: 'x' }, payload: { repo: {} },
      }),
    ).toThrow();
    sqlite.close();
  });
});

describe('prompt library API (custom entries, token-gated)', () => {
  let srv: AccServer;
  const AUTH = { ...HOST_OK, 'x-acc-token': 'test-token' };
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('refuses reads and writes without the token (a user’s prompts aren’t public)', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/prompts', headers: HOST_OK })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'POST', url: '/api/prompts', headers: HOST_OK, payload: {} })).statusCode).toBe(401);
  });

  it('creates, lists, and deletes a custom prompt', async () => {
    const create = await srv.app.inject({
      method: 'POST',
      url: '/api/prompts',
      headers: AUTH,
      payload: { title: 'My prompt', category: 'game', summary: 'do a thing', body: 'Body {x}', recommendedModel: 'claude' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().prompt.id as string;
    expect(id).toMatch(/^custom-/);

    const list = await srv.app.inject({ method: 'GET', url: '/api/prompts', headers: AUTH });
    expect(list.json().prompts.map((p: { id: string }) => p.id)).toContain(id);

    const del = await srv.app.inject({ method: 'DELETE', url: `/api/prompts/${id}`, headers: AUTH });
    expect(del.statusCode).toBe(200);
    expect((await srv.app.inject({ method: 'DELETE', url: `/api/prompts/${id}`, headers: AUTH })).statusCode).toBe(404);
  });

  it('rejects invalid input with 400', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/prompts', headers: AUTH, payload: { title: '', category: 'game', summary: 's', body: 'b' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('run log + live run control API (persisted history, honest timeline states)', () => {
  let srv: AccServer;
  const AUTH = { ...HOST_OK, 'x-acc-token': 'test-token' };

  // Fake agent process: streams a short scripted session, then exits 0 — the endpoints
  // under test see exactly what a real `claude -p` run would leave behind.
  const spawner: Spawner = {
    spawn(_opts: SpawnOpts): SpawnHandle {
      async function* gen() {
        yield '{"type":"system","subtype":"init"}';
        yield '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit"}]}}';
        yield '{"type":"result","subtype":"success","num_turns":2,"usage":{"input_tokens":1200,"output_tokens":340},"result":"All green — fixed the flaky test."}';
      }
      return { lines: gen(), done: Promise.resolve(0), kill: () => {} };
    },
  };

  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false, spawner });
    // no scanner in tests → the dispatch cwd allow-list resolves through bus repo state
    srv.bus.publish({
      id: 'e-runlog-repo',
      type: 'repo.upserted',
      ts: '2026-07-16T08:00:00.000Z',
      source: { kind: 'scanner', ref: 'test' },
      payload: {
        repo: {
          id: 'sentinel', name: 'SENTINEL', category: 'game', status: 'active',
          description: 'x', branch: 'main', updatedTs: '2026-07-16T08:00:00.000Z', agents: [],
        },
      },
    });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('refuses the run log without the token', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/runs', headers: HOST_OK })).statusCode).toBe(401);
  });

  /** Poll to the terminal state with a hard deadline — fixed sleeps flake on slow CI workers. */
  const waitForFinish = async (runId: string): Promise<void> => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const res = await srv.app.inject({ method: 'GET', url: `/api/runs/${runId}`, headers: AUTH });
      const status = (res.json().run as { status: string }).status;
      if (status === 'done' || status === 'failed') return;
      if (Date.now() > deadline) throw new Error(`run ${runId} still '${status}' after 5s`);
      await new Promise((r) => setTimeout(r, 20));
    }
  };

  it('dispatch → history row → detail with ended timeline + final report; kill refuses finished runs', async () => {
    const dis = await srv.app.inject({
      method: 'POST', url: '/api/dispatch', headers: AUTH,
      payload: { repoId: 'sentinel', task: 'fix the flaky test' },
    });
    expect(dis.statusCode).toBe(200);
    const runId = dis.json().runId as string;
    await waitForFinish(runId);

    const list = await srv.app.inject({ method: 'GET', url: '/api/runs?limit=5', headers: AUTH });
    expect(list.statusCode).toBe(200);
    const rows = list.json().runs as Array<{ id: string; status: string }>;
    expect(rows[0]).toMatchObject({ id: runId, status: 'done' });

    const detail = await srv.app.inject({ method: 'GET', url: `/api/runs/${runId}`, headers: AUTH });
    expect(detail.statusCode).toBe(200);
    const run = detail.json().run as {
      timelineState: string; timeline: Array<{ kind: string; text: string }>; resultText: string | null;
    };
    expect(run.timelineState).toBe('ended'); // started this boot, finished — never 'unavailable'
    expect(run.timeline.some((e) => e.kind === 'tool' && e.text === 'Edit')).toBe(true);
    expect(run.resultText).toContain('All green');

    // a finished run is not killable — 400 with an honest reason, not a silent no-op
    const kill = await srv.app.inject({ method: 'POST', url: `/api/runs/${runId}/kill`, headers: AUTH, payload: {} });
    expect(kill.statusCode).toBe(400);

    expect((await srv.app.inject({ method: 'GET', url: '/api/runs/never-existed', headers: AUTH })).statusCode).toBe(404);
  });

  it('stats: exact window roll-up (totals, outcomes, tokens by repo/model), token-gated', async () => {
    // a second finished run with an explicit model — the previous test completed one on 'default'
    const dis = await srv.app.inject({
      method: 'POST', url: '/api/dispatch', headers: AUTH,
      payload: { repoId: 'sentinel', task: 'second run for the roll-up', model: 'sonnet' },
    });
    expect(dis.statusCode).toBe(200);
    await waitForFinish(dis.json().runId as string);

    expect((await srv.app.inject({ method: 'GET', url: '/api/runs/stats', headers: HOST_OK })).statusCode).toBe(401);

    const res = await srv.app.inject({ method: 'GET', url: '/api/runs/stats?days=7', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const stats = res.json().stats as {
      byRepo: Array<{ key: string; runs: number; tokensIn: number; tokensOut: number }>;
      byModel: Array<{ key: string }>;
    };
    expect(stats).toMatchObject({
      windowDays: 7,
      total: 2,
      byStatus: { done: 2, failed: 0, running: 0, queued: 0 },
      tokensIn: 2400, // exact sum of the two fake streams' usage — never an estimate
      tokensOut: 680,
      runsWithoutUsage: 0,
    });
    expect(stats.byRepo).toEqual([{ key: 'sentinel', runs: 2, tokensIn: 2400, tokensOut: 680 }]);
    expect(stats.byModel.map((s) => s.key).sort()).toEqual(['default', 'sonnet']);
  });

  it('outcome: a human judges a FINISHED run; bad input and unknown runs are refused', async () => {
    const list = await srv.app.inject({ method: 'GET', url: '/api/runs?limit=1', headers: AUTH });
    const runId = (list.json().runs as Array<{ id: string }>)[0].id;

    const bad = await srv.app.inject({ method: 'POST', url: `/api/runs/${runId}/outcome`, headers: AUTH, payload: { action: 'loved-it' } });
    expect(bad.statusCode).toBe(400);
    expect((await srv.app.inject({ method: 'POST', url: '/api/runs/nope/outcome', headers: AUTH, payload: { action: 'accepted' } })).statusCode).toBe(404);

    const ok = await srv.app.inject({ method: 'POST', url: `/api/runs/${runId}/outcome`, headers: AUTH, payload: { action: 'corrected' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().run.humanAction).toBe('corrected');

    const detail = await srv.app.inject({ method: 'GET', url: `/api/runs/${runId}`, headers: AUTH });
    expect(detail.json().run.humanAction).toBe('corrected'); // persisted, not just echoed
  });
});
