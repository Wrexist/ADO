import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { buildServer, type AccServer } from '../app';
import { openDb } from '../db';
import { executionLocks, runs } from '../db/schema';
import type { Spawner } from './spawner';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'controlos-dispatch-acceptance-')), repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  writeFileSync(join(repo, 'original.txt'), 'original'); git(['add', '.']); git(['commit', '-qm', 'base']);
  const token = 'offline-dispatch-acceptance', dbPath = join(root, 'profile.sqlite');
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: token, dbPath, projectDirs: [], demo: false };
  const auth = { host: '127.0.0.1:8787', 'x-acc-token': token };
  const options = { startSystem: false, startScanner: true, workspaceRoot: join(root, 'workspaces') };
  return { root, repo, git, env, auth, options };
}

function controlledSpawner(marker: string, starts: Array<{ prompt: string; cwd: string }>): Spawner {
  return { spawn(opts) {
    starts.push({ prompt: opts.prompt, cwd: opts.cwd });
    const code = `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(marker)},${JSON.stringify('started\n')});
      setInterval(()=>{if(fs.existsSync('finish.signal')){fs.unlinkSync('finish.signal');fs.writeFileSync('result.txt','offline result');process.exit(0)}},10);`;
    const child = spawn(process.execPath, ['-e', code], { cwd: opts.cwd, windowsHide: true, stdio: 'ignore' });
    return { lines: (async function* () {})(), done: new Promise<number>((accept, reject) => { child.once('error', reject); child.once('close', (code) => accept(code ?? -1)); }), kill() { child.kill(); } };
  } };
}

it('T15: retains a real HTTP-acknowledged queue entry through abrupt server death and claims it only once after restart', async () => {
  const h = fixture(), marker = join(h.root, 'starts.txt'), unexpected = join(h.root, 'unexpected.txt');
  const code = `import {buildServer} from ${JSON.stringify(new URL('../app.ts', import.meta.url).href)};
    import {writeFileSync} from 'node:fs';
    import {createServer} from 'node:net';
    const port=await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const port=probe.address().port;probe.close(()=>resolve(port))})});
    const server=await buildServer({...${JSON.stringify(h.env)},port},{...${JSON.stringify(h.options)},spawner:{spawn(){writeFileSync(${JSON.stringify(unexpected)},'unexpected');throw Error('must not spawn before crash')}}});
    console.log('READY '+await server.app.listen({port,host:'127.0.0.1'}));`;
  const host = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', server: AccServer | undefined, inspection: ReturnType<typeof openDb> | undefined;
  host.stdout.on('data', (b) => { stdout += b; }); host.stderr.on('data', (b) => { stderr += b; });
  const closed = new Promise<void>((accept, reject) => { host.once('error', reject); host.once('close', () => accept()); });
  try {
    await expect.poll(() => stdout.match(/READY (http:\/\/[^\s]+)/)?.[1], { timeout: 20000, message: stderr }).toBeTruthy();
    const base = stdout.match(/READY (http:\/\/[^\s]+)/)![1];
    const request = async <T = unknown>(path: string, payload?: object): Promise<T> => {
      const response = await fetch(base + path, { method: payload ? 'POST' : 'GET', headers: { 'x-acc-token': h.env.accToken, 'content-type': 'application/json' }, body: payload ? JSON.stringify(payload) : undefined });
      expect(response.status).toBe(200); return response.json() as Promise<T>;
    };
    await request('/api/projects', { dir: h.repo });
    const source = (await request<{ sources: Array<{ id: string }> }>('/api/portfolio')).sources[0].id.slice(6);
    await request(`/api/projects/${source}/settings`, { feature: 'agents', enabled: true });
    inspection = openDb(h.env.dbPath);
    // Fault at claim persistence leaves the already accepted transaction durable.
    inspection.sqlite.exec("CREATE TRIGGER crash_before_claim BEFORE INSERT ON events WHEN NEW.type='build.updated' AND json_extract(NEW.payload,'$.build.state')='running' BEGIN SELECT RAISE(ABORT,'fixture claim fault'); END");
    const accepted = await request<{ runId: string }>('/api/dispatch', { repoId: source, task: 'acknowledged before crash' });
    expect((await request<{ run: { status: string } }>(`/api/runs/${accepted.runId}`)).run.status).toBe('queued');
    expect(inspection.db.select().from(executionLocks).all()).toEqual([]);
    expect(existsSync(unexpected)).toBe(false);
    host.kill(); await closed; // No close()/queue cancellation or SQLite cleanup in the server.
    expect(inspection.db.select().from(runs).where(eq(runs.id, accepted.runId)).get()?.status).toBe('queued');
    inspection.sqlite.exec('DROP TRIGGER crash_before_claim');
    const starts: Array<{ prompt: string; cwd: string }> = [], leases: string[] = [];
    const delegate = controlledSpawner(marker, starts);
    const spawner: Spawner = { spawn(opts) {
      const lock = inspection!.db.select().from(executionLocks).where(eq(executionLocks.runId, accepted.runId)).get();
      expect(lock?.owner).toMatch(/^[0-9a-f-]{36}$/); leases.push(lock!.owner); return delegate.spawn(opts);
    } };
    server = await buildServer(h.env, { ...h.options, spawner });
    await expect.poll(() => existsSync(marker), { timeout: 20000 }).toBe(true);
    expect(starts).toHaveLength(1); expect(leases).toHaveLength(1);
    expect(server.runner.reconcileOrphans()).toBe(0);
    expect(inspection.db.select().from(runs).get()?.status).toBe('running');
    writeFileSync(join(starts[0].cwd, 'finish.signal'), 'finish');
    await expect.poll(() => server!.runner.isLive(accepted.runId), { timeout: 20000 }).toBe(false);
    expect(inspection.db.select().from(runs).all()).toHaveLength(1);
    expect(inspection.db.select().from(runs).get()).toMatchObject({ id: accepted.runId, status: 'done' });
    await server.close(); server = await buildServer(h.env, { ...h.options, spawner });
    expect(starts).toHaveLength(1); expect(readFileSync(marker, 'utf8')).toBe('started\n');
    expect(inspection.db.select().from(executionLocks).all()).toEqual([]);
    expect(h.git(['status', '--porcelain'])).toBe('');
  } finally {
    if (host.exitCode === null && host.signalCode === null) host.kill(); await closed;
    await server?.close(); inspection?.sqlite.close(); await rm(h.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 90000);

it('T17/T19: identical HTTP requests share one run, changed requests conflict, and disabled queued work never spawns', async () => {
  const h = fixture(), starts: Array<{ prompt: string; cwd: string }> = [], marker = join(h.root, 'starts.txt');
  const spawner = controlledSpawner(marker, starts); let server: AccServer | undefined;
  try {
    server = await buildServer(h.env, { ...h.options, spawner });
    const post = (url: string, payload: object, key?: string) => server!.app.inject({ method: 'POST', url, headers: { ...h.auth, ...(key ? { 'idempotency-key': key } : {}) }, payload });
    expect((await post('/api/projects', { dir: h.repo })).statusCode).toBe(200);
    const source = (await server.app.inject({ url: '/api/portfolio', headers: h.auth })).json().sources[0].id.slice(6);
    expect((await post(`/api/projects/${source}/settings`, { feature: 'agents', enabled: true })).statusCode).toBe(200);
    const input = { repoId: source, task: 'first', provider: 'codex', model: 'fixture' };
    const replies = await Promise.all([post('/api/dispatch', input, 'first-key'), post('/api/dispatch', input, 'first-key')]);
    expect(replies.map((r) => r.statusCode)).toEqual([200, 200]); expect(replies[0].json()).toEqual(replies[1].json());
    const firstId = replies[0].json().runId;
    await expect.poll(() => existsSync(marker), { timeout: 20000 }).toBe(true);
    for (const change of [{ task: 'changed' }, { model: 'different' }, { provider: 'claude' }]) expect((await post('/api/dispatch', { ...input, ...change }, 'first-key')).statusCode).toBe(409);
    const queuedInput = { repoId: source, task: 'queued before switch' };
    const queued = await post('/api/dispatch', queuedInput, 'queued-key'); expect(queued.statusCode).toBe(200);
    const queuedId = queued.json().runId;
    expect((await server.app.inject({ url: `/api/runs/${queuedId}`, headers: h.auth })).json().run.status).toBe('queued');
    expect((await post(`/api/projects/${source}/settings`, { feature: 'agents', enabled: false })).statusCode).toBe(200);
    writeFileSync(join(starts[0].cwd, 'finish.signal'), 'finish');
    await expect.poll(() => server!.runner.isLive(firstId) || server!.runner.isLive(queuedId), { timeout: 20000 }).toBe(false);
    const failed = (await server.app.inject({ url: `/api/runs/${queuedId}`, headers: h.auth })).json().run;
    expect(failed.status).toBe('failed'); expect(failed.note).toContain('turned off');
    expect(starts).toHaveLength(1);
    await server.close(); server = await buildServer(h.env, { ...h.options, spawner });
    expect((await post('/api/dispatch', input, 'first-key')).json()).toEqual({ runId: firstId });
    expect((await post('/api/dispatch', queuedInput, 'queued-key')).json()).toEqual({ runId: queuedId });
    expect((await post('/api/dispatch', { ...input, task: 'changed after restart' }, 'first-key')).statusCode).toBe(409);
    expect((await post('/api/dispatch', { ...input, task: 'new while disabled' }, 'new-key')).statusCode).toBe(403);
    expect((await server.app.inject({ url: '/api/runs', headers: h.auth })).json().runs).toHaveLength(2);
    expect(starts).toHaveLength(1); expect(readFileSync(marker, 'utf8')).toBe('started\n'); expect(h.git(['status', '--porcelain'])).toBe('');
  } finally { await server?.close(); await rm(h.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 90000);
