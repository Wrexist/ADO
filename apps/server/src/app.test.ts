import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AccServer } from './app';
import { buildServer } from './app';
import { Bus } from './bus';
import { openDb } from './db';

const ENV = {
  port: 8787,
  webOrigin: 'http://localhost:5173',
  accToken: 'test-token',
  dbPath: ':memory:',
  demo: false,
  projectDirs: [],
  githubToken: '',
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
