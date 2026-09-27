import { expect, it } from 'vitest';
import { buildServer } from './app';
import { get, type IncomingMessage } from 'node:http';

it('ends an active authenticated event stream before waiting for server shutdown', async () => {
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'shutdown-fixture', dbPath: ':memory:', demo: false, projectDirs: [] }, { startSystem: false });
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const address = server.app.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = get({ hostname: '127.0.0.1', port: address.port, path: '/events', headers: { host: '127.0.0.1', 'x-acc-token': 'shutdown-fixture' } }, resolve);
    request.setTimeout(10000, () => request.destroy(new Error('Stream deadline exceeded')));
    request.on('error', reject);
  });
  const reader = response[Symbol.asyncIterator]();
  try {
    expect(response.statusCode).toBe(200);
    expect((await reader.next()).done).toBe(false);
    const closed = server.close();
    let ended = false;
    while (!ended) ended = Boolean((await reader.next()).done);
    await closed;
    expect(server.app.server.listening).toBe(false);
  } finally { response.destroy(); await server.close(); }
});
