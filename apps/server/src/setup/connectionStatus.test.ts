import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildServer, type AccServer } from '../app';
import { ConnectionsStore } from '../connections/store';

it('updates Setup from explicit credential verification and clears prior authentication on restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-setup-auth-'));
  new ConnectionsStore(join(root, 'connections.json')).set('github', 'expired-offline-fixture-key');
  let status = 401;
  const provider = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    expect(String(url)).toBe('https://api.github.com/user');
    return new Response(null, { status });
  });
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture-access', dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': env.accToken };
  let server: AccServer | undefined;
  try {
    server = await buildServer(env, { startSystem: false });
    const get = async () => (await server!.app.inject({ url: '/api/setup', headers })).json().results.find((r: { id: string }) => r.id === 'github-token');
    expect(await get()).toMatchObject({ status: 'configured', detail: expect.stringContaining('not checked yet') });
    expect(provider).not.toHaveBeenCalled();
    expect((await server.app.inject({ method: 'POST', url: '/api/connections/github/verify', headers })).statusCode).toBe(200);
    expect(await get()).toMatchObject({ status: 'configured', detail: expect.stringContaining('GitHub rejected this token') });
    status = 200;
    await server.app.inject({ method: 'POST', url: '/api/connections/github/verify', headers });
    expect(await get()).toMatchObject({ status: 'verified', detail: expect.stringContaining('repository access was not checked') });
    expect(provider).toHaveBeenCalledTimes(2);
    await server.close(); server = undefined;
    server = await buildServer(env, { startSystem: false });
    expect(await get()).toMatchObject({ status: 'configured', detail: expect.stringContaining('not checked yet') });
    expect(provider).toHaveBeenCalledTimes(2);
  } finally { await server?.close(); provider.mockRestore(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
