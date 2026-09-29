import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer, type AccServer } from './app';

// T27: Host, Origin, credential and proxy trust are each tested on their own, across
// JSON reads, mutations, the event stream, preflight and the static web bundle.
const KEY = 'boundary-fixture-key', HOST = '127.0.0.1:8787';
const FORGED = { 'x-forwarded-host': HOST, 'x-forwarded-for': '127.0.0.1', 'x-forwarded-proto': 'http', forwarded: `for=127.0.0.1;host=${HOST};proto=http` };
let server: AccServer, root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'controlos-boundaries-'));
  mkdirSync(join(root, 'web', 'assets'), { recursive: true });
  writeFileSync(join(root, 'web', 'index.html'), '<!doctype html><title>fixture</title>');
  writeFileSync(join(root, 'web', 'assets', 'app.js'), 'console.log(1)');
  server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: KEY, dbPath: ':memory:', demo: false, projectDirs: [], serveWebDir: join(root, 'web') }, { startSystem: false, startScanner: false });
});
afterAll(async () => { await server.close(); rmSync(root, { recursive: true, force: true }); });

const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS', url: string, headers: Record<string, string>) =>
  server.app.inject({ method, url, headers, ...(method === 'POST' || method === 'PUT' ? { payload: {} } : {}) });
const promptCount = async () => (await send('GET', '/api/prompts', { host: HOST, 'x-acc-token': KEY })).json().prompts?.length;
const ROUTES = [['GET', '/api/runs'], ['POST', '/api/app-open'], ['GET', '/events'], ['GET', '/'], ['GET', '/assets/app.js'], ['GET', '/health']] as const;

describe('hostile web origin boundaries (T27)', () => {
  it('Host alone: a valid key without Origin cannot pass a foreign or missing Host, even with forged proxy headers', async () => {
    for (const host of ['evil.example:8787', '127.0.0.1.evil.example:8787', '']) {
      for (const [method, url] of ROUTES) {
        const res = await send(method, url, { host, 'x-acc-token': KEY, ...FORGED });
        expect(res.statusCode, `${method} ${url} host=${host}`).toBe(403);
        expect(res.json()).toEqual({ error: 'forbidden host' });
      }
    }
  });

  it('Origin alone: a hostile Origin is refused on static files, health and mutations; no mutation lands', async () => {
    const before = await promptCount();
    for (const [method, url] of [...ROUTES, ['PUT', '/api/prompts/x'], ['DELETE', '/api/prompts/x'], ['POST', '/api/prompts'], ['OPTIONS', '/api/runs']] as const) {
      const res = await send(method, url, { host: HOST, origin: 'https://hostile.invalid', 'x-acc-token': KEY });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    expect(await promptCount()).toBe(before);
  });

  it('Credential alone: no key or a wrong/rotated key is refused on reads, mutations and the event stream; the URL key is ignored', async () => {
    for (const key of [undefined, 'wrong', `${KEY}-rotated`]) {
      const headers = { host: HOST, ...(key ? { 'x-acc-token': key } : {}) };
      for (const [method, url] of [['GET', '/api/runs'], ['POST', '/api/session'], ['GET', '/events'], ['GET', '/api/connections']] as const) {
        const res = await send(method, url, headers);
        expect(res.statusCode, `${method} ${url} key=${key}`).toBe(401);
        expect(res.headers['content-type']).not.toContain('text/event-stream');
      }
    }
    expect((await send('GET', `/events?token=${KEY}`, { host: HOST })).statusCode).toBe(401);
  });

  it('Proxy alone: forged forwarding headers grant nothing and change nothing', async () => {
    for (const [method, url] of [['GET', '/api/runs'], ['POST', '/api/session'], ['GET', '/events']] as const) {
      expect((await send(method, url, { host: HOST, ...FORGED })).statusCode, `${method} ${url}`).toBe(401);
    }
    const plain = await send('GET', '/api/runs', { host: HOST, 'x-acc-token': KEY });
    const forged = await send('GET', '/api/runs', { host: HOST, 'x-acc-token': KEY, ...FORGED, 'x-forwarded-for': '203.0.113.9' });
    expect(forged.statusCode).toBe(200); expect(forged.body).toBe(plain.body);
    expect((server.app.initialConfig as { trustProxy?: unknown }).trustProxy ?? false).toBe(false);
  });
});
