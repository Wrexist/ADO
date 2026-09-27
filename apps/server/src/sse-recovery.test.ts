import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it } from 'vitest';
import { buildServer } from './app';

function firstFrame(port: number, cursor: string): Promise<{ event: string; id: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const request = get({ hostname: '127.0.0.1', port, path: '/events', headers: {
      host: '127.0.0.1', 'x-acc-token': 'sse-test-key', 'last-event-id': cursor,
    } }, (response) => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
      let pending = '';
      response.setEncoding('utf8');
      response.on('error', reject);
      response.on('data', (chunk: string) => {
        pending += chunk;
        let end: number;
        while ((end = pending.indexOf('\n\n')) >= 0) {
          const frame = pending.slice(0, end);
          pending = pending.slice(end + 2);
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (!data) continue;
          try {
            resolve({ event: /^event: (.+)$/m.exec(frame)![1], id: Number(/^id: (\d+)$/m.exec(frame)![1]), data: JSON.parse(data) });
          } catch (error) { reject(error); }
          response.destroy();
          return;
        }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error('SSE response timeout')));
    request.on('error', reject);
  });
}

it('T43: reconnects over HTTP with an authoritative snapshot after event retention', async () => {
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'sse-test-key', dbPath: ':memory:', demo: false, projectDirs: [] }, { startSystem: false });
  try {
    for (let i = 0; i < 3; i++) server.bus.publish({
      id: `retention-${i}`, type: 'health.checked', ts: new Date().toISOString(),
      source: { kind: 'health', ref: 'server' }, payload: { service: 'server', state: i === 2 ? 'degraded' : 'operational' },
    });
    const latest = server.bus.snapshot();
    expect(server.bus.compact()).toBeGreaterThanOrEqual(2);
    await server.app.listen({ host: '127.0.0.1', port: 0 });
    const port = (server.app.server.address() as AddressInfo).port;
    const stale = await firstFrame(port, String(latest.seq - 2));
    expect(stale).toEqual({ event: 'snapshot', id: latest.seq, data: latest });
    for (const malformed of ['-1', '1garbage', '0.5', '9007199254740992']) {
      expect((await firstFrame(port, malformed)).event).toBe('snapshot');
    }
    const recent = await firstFrame(port, String(latest.seq - 1));
    expect(recent.event).toBe('evt');
    expect(recent.id).toBe(latest.seq);
    expect(recent.data).toMatchObject({ id: 'retention-2' });
  } finally { await server.close(); }
}, 15000);
