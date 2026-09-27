import { expect, it } from 'vitest';
import { buildServer } from './app';

it('rejects hostile origins independently of valid credentials, Host and fabricated proxy headers', async () => {
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'origin-fixture-key', dbPath: ':memory:', demo: false, projectDirs: [] }, { startSystem: false, startScanner: false });
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'origin-fixture-key' };
  try {
    for (const origin of ['https://hostile.invalid', 'null', 'http://localhost:5173.hostile.invalid', 'http://localhost:8787']) {
      for (const [method, url] of [['GET', '/api/runs'], ['GET', '/events?token=origin-fixture-key'], ['POST', '/api/session']] as const) {
        const response = await server.app.inject({ method, url, headers: { ...headers, origin, 'x-forwarded-host': 'localhost:5173', 'x-forwarded-proto': 'http', forwarded: 'host=localhost:5173;proto=http' } });
        expect(response.statusCode).toBe(403); expect(response.json()).toEqual({ error: 'forbidden origin' });
      }
      expect((await server.app.inject({ method: 'OPTIONS', url: '/api/session', headers: { ...headers, origin, 'access-control-request-method': 'POST' } })).statusCode).toBe(403);
    }
    for (const origin of [undefined, 'http://localhost:5173']) {
      const trusted = { ...headers, ...(origin ? { origin } : {}) };
      expect((await server.app.inject({ url: '/api/runs', headers: trusted })).statusCode).toBe(200);
      expect((await server.app.inject({ method: 'POST', url: '/api/session', headers: trusted })).statusCode).toBe(200);
      expect((await server.app.inject({ url: '/api/runs', headers: { ...trusted, 'x-acc-token': 'wrong' } })).statusCode).toBe(401);
      expect((await server.app.inject({ url: '/api/runs', headers: { ...trusted, host: 'hostile.invalid' } })).statusCode).toBe(403);
    }
    const wrongKey = await server.app.inject({ method: 'POST', url: '/api/session', headers: { ...headers, origin: 'http://localhost:5173', 'x-acc-token': 'wrong' } });
    expect(wrongKey.statusCode).toBe(401);
    expect(wrongKey.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect((await server.app.inject({ method: 'OPTIONS', url: '/api/session', headers: { ...headers, origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } })).statusCode).toBe(204);
  } finally { await server.close(); }
});
