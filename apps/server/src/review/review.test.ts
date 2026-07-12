import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildServer, type AccServer } from '../app';

const ENV = { port: 8791, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
const HOST = { host: '127.0.0.1:8791' };
const AUTH = { ...HOST, 'x-acc-token': 'test-token' };

describe('deep-review endpoints', () => {
  let srv: AccServer;
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('is token-gated', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/projects/x/review', headers: HOST, payload: {} })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'GET', url: '/api/review/nope', headers: HOST })).statusCode).toBe(401);
  });

  it('rejects a repo not in the scanner allow-list (400 — no real spawn, honest failure)', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/projects/ghost-repo/review', headers: AUTH, payload: {} });
    expect(res.statusCode).toBe(400); // ghost-repo isn't scanned → not reviewable
  });

  it('returns 404 for an unknown review run', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/review/nope', headers: AUTH })).statusCode).toBe(404);
  });
});
