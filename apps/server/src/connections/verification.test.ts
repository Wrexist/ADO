import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { ConnectionsStore } from './store';

it('separates configured, rejected, inconclusive, verified and stale credentials without exposing the key', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-check-')); let code = 401; let clock = 1000000;
  const requests: Array<{ url: string; options?: RequestInit }> = [];
  const fake = (async (url: string, options?: RequestInit) => { requests.push({ url, options }); if (code === 0) throw new Error('fixture-private-token'); return new Response(null, { status: code }); }) as typeof fetch;
  const store = new ConnectionsStore(join(root, 'connections.json'), undefined, undefined, fake, () => clock);
  try {
    store.set('github', 'fixture-private-token');
    expect(store.status('github')).toMatchObject({ configured: true, authentication: 'unverified', checkedTs: null });
    expect((await store.verify('github')).authentication).toBe('rejected');
    code = 403; expect((await store.verify('github')).authentication).toBe('unavailable');
    code = 0; expect((await store.verify('github')).authentication).toBe('unavailable');
    code = 200; expect((await store.verify('github')).authentication).toBe('verified');
    expect(requests[0].url).toBe('https://api.github.com/user');
    expect(requests[0].options?.redirect).toBe('error');
    expect(JSON.stringify(store.statusAll())).not.toContain('fixture-private-token');
    clock += 300001; expect(store.status('github').authentication).toBe('stale');
    store.set('github', 'replacement'); expect(store.status('github').authentication).toBe('unverified');
    store.set('figma', 'unsupported-fixture');
    const count = requests.length;
    expect((await store.verify('figma')).authentication).toBe('unsupported');
    expect(requests).toHaveLength(count);
    expect(new ConnectionsStore(join(root, 'connections.json')).status('github').authentication).toBe('unverified');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('discards a late verification response after the credential has changed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-race-'));
  let resolve!: (response: Response) => void;
  const fake = (() => new Promise<Response>((accept) => { resolve = accept; })) as typeof fetch;
  const store = new ConnectionsStore(join(root, 'connections.json'), undefined, undefined, fake);
  try {
    store.set('github', 'old-fixture'); const pending = store.verify('github');
    store.set('github', 'new-fixture'); resolve(new Response(null, { status: 200 }));
    expect((await pending).authentication).toBe('unverified');
    expect(store.status('github').checkedTs).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
