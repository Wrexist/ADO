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

it('expires checks monotonically at five minutes and never revives an observed stale check', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-clock-'));
  let wall = 1000000, elapsed = 100;
  const fake = (async () => new Response(null, { status: 200 })) as typeof fetch;
  const store = new ConnectionsStore(join(root, 'connections.json'), undefined, undefined, fake, () => wall, () => elapsed);
  try {
    store.set('github', 'fixture-clock-key');
    await store.verify('github'); const checkedTs = store.status('github').checkedTs;
    elapsed += 299999; expect(store.status('github').authentication).toBe('verified');
    elapsed++; expect(store.status('github').authentication).toBe('stale'); // wall clock held still
    elapsed = 100; expect(store.status('github').authentication).toBe('stale');
    expect(store.status('github').checkedTs).toBe(checkedTs);
    expect((await store.verify('github')).authentication).toBe('verified');
    wall += 10; store.status('github'); wall--;
    expect(store.status('github').authentication).toBe('stale'); // backward movement after a read
    wall += 1; expect(store.status('github').authentication).toBe('stale');
    await store.verify('github'); wall += 300000;
    expect(store.status('github').authentication).toBe('stale'); // exact wall deadline
    await store.verify('github'); elapsed--;
    expect(store.status('github').authentication).toBe('stale'); // broken elapsed clock
    await store.verify('github'); wall = NaN;
    expect(store.status('github').authentication).toBe('stale');
    expect((await store.verify('github')).authentication).toBe('unverified');
    expect(store.status('github').checkedTs).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('explains GitHub scopes and login, and checks Anthropic keys read-only', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-connection-detail-'));
  let reply = () => new Response(null, { status: 500 });
  const urls: string[] = [];
  const fake = (async (url: string) => { urls.push(url); return reply(); }) as typeof fetch;
  const store = new ConnectionsStore(join(root, 'connections.json'), undefined, undefined, fake);
  const github = (scopes: string | null, login: unknown = 'octo-cat') => () => new Response(JSON.stringify({ login }), { status: 200, headers: scopes === null ? {} : { 'x-oauth-scopes': scopes } });
  try {
    store.set('github', 'ghp_fixture');
    reply = github('repo, workflow'); expect((await store.verify('github')).verificationMessage).toBe('Connected as @octo-cat; public and private repositories are readable.');
    reply = github('public_repo'); expect((await store.verify('github')).verificationMessage).toContain('only public repositories');
    reply = github(''); const bare = await store.verify('github');
    expect(bare).toMatchObject({ authentication: 'verified' }); expect(bare.verificationMessage).toContain('no repo scope');
    reply = github(null, '<script>'); expect((await store.verify('github')).verificationMessage).toBe('Connected. Fine-grained token: repository access was not checked; missing permissions show as unknown data.');
    store.set('anthropic', 'sk-ant-fixture');
    reply = () => new Response(null, { status: 200 }); expect((await store.verify('anthropic')).authentication).toBe('verified');
    reply = () => new Response(null, { status: 401 }); expect((await store.verify('anthropic')).authentication).toBe('rejected');
    reply = () => new Response(null, { status: 529 }); expect((await store.verify('anthropic'))).toMatchObject({ authentication: 'unavailable', verificationMessage: expect.stringContaining('529') });
    expect(urls.at(-1)).toBe('https://api.anthropic.com/v1/models?limit=1');
    store.set('slack', 'https://hooks.slack.com/services/fixture'); const count = urls.length;
    expect((await store.verify('slack')).verificationMessage).toContain('would post a message');
    expect(urls).toHaveLength(count);
    expect(JSON.stringify(store.statusAll())).not.toMatch(/ghp_fixture|sk-ant-fixture/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
