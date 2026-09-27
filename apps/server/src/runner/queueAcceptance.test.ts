import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { buildServer, type AccServer } from '../app';
import { commonGitIdentity } from '../projects/checkoutIdentity';
import type { Spawner } from './spawner';
import type { AgentRun } from '@ado/shared';

it('T12: serializes unregistered sibling writers, enforces two agent slots and exposes current waiting reasons through authenticated HTTP', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-queue-acceptance-'));
  const repos = ['a', 'b', 'c'].map((name) => join(root, name)), sibling = join(root, 'a-sibling');
  const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  for (const repo of repos) {
    mkdirSync(repo); git(repo, ['init', '-q']); git(repo, ['config', 'user.name', 'Fixture']); git(repo, ['config', 'user.email', 'fixture@example.test']);
    writeFileSync(join(repo, 'original.txt'), 'original'); git(repo, ['add', '.']); git(repo, ['commit', '-qm', 'base']);
  }
  git(repos[0], ['worktree', 'add', '--detach', sibling, 'HEAD']);
  const auth = { host: '127.0.0.1:8787', 'x-acc-token': 'queue-acceptance-fixture' };
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: auth['x-acc-token'], dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  const active = new Map<string, number>(), launched: Array<{ prompt: string; cwd: string }> = [];
  let maxGlobal = 0, maxRepository = 0, server: AccServer | undefined;
  const spawner: Spawner = { spawn(opts) {
    const identity = commonGitIdentity(opts.cwd);
    active.set(identity, (active.get(identity) ?? 0) + 1);
    maxRepository = Math.max(maxRepository, active.get(identity)!);
    maxGlobal = Math.max(maxGlobal, [...active.values()].reduce((sum, n) => sum + n, 0));
    launched.push({ prompt: opts.prompt, cwd: opts.cwd });
    const child = spawn(process.execPath, ['-e', "const fs=require('node:fs');fs.writeFileSync('started.signal','ready');setInterval(()=>{if(fs.existsSync('finish.signal')){fs.unlinkSync('started.signal');fs.unlinkSync('finish.signal');fs.writeFileSync('result.txt','Offline fixture result');process.exit(0)}},10)"], { cwd: opts.cwd, windowsHide: true, stdio: 'ignore' });
    const done = new Promise<number>((accept, reject) => { child.once('error', reject); child.once('close', (code) => { active.set(identity, active.get(identity)! - 1); accept(code ?? -1); }); });
    return { done, lines: (async function* () {})(), kill() { child.kill(); } };
  } };
  const options = { startSystem: false, spawner, workspaceRoot: join(root, 'workspaces') };
  try {
    server = await buildServer(env, options);
    const post = (url: string, payload: object) => server!.app.inject({ method: 'POST', url, headers: auth, payload });
    const get = async (url: string) => (await server!.app.inject({ url, headers: auth })).json();
    for (const dir of [...repos, sibling]) expect((await post('/api/projects', { dir })).statusCode).toBe(200);
    const portfolio = await get('/api/portfolio'); expect(portfolio.checkouts).toEqual([]);
    const source = (path: string) => portfolio.sources.find((s: { location: string }) => resolve(s.location).toLowerCase() === resolve(path).toLowerCase()).id.slice(6) as string;
    for (const dir of [...repos, sibling]) expect((await post(`/api/projects/${source(dir)}/settings`, { feature: 'agents', enabled: true })).statusCode).toBe(200);
    const dispatch = async (repo: string, task: string) => {
      const response = await post('/api/dispatch', { repoId: source(repo), task });
      expect(response.statusCode, response.body).toBe(200); return response.json().runId as string;
    };
    const detail = async (id: string): Promise<AgentRun> => (await get(`/api/runs/${id}`)).run;
    const started = async (prompt: string) => expect.poll(() => { const run = launched.find((r) => r.prompt === prompt); return Boolean(run && existsSync(join(run.cwd, 'started.signal'))); }, { timeout: 30000 }).toBe(true);
    const finish = (prompt: string) => writeFileSync(join(launched.find((r) => r.prompt === prompt)!.cwd, 'finish.signal'), 'finish');
    const first = await dispatch(repos[0], 'A first'); await started('A first');
    const second = await dispatch(sibling, 'A second');
    const independent = await dispatch(repos[1], 'B'); await started('B');
    expect(launched.map((r) => r.prompt)).toEqual(['A first', 'B']);
    expect(await detail(second)).toMatchObject({ status: 'queued', waitingReason: 'Waiting for the current or quarantined writer in this repository.' });
    expect((await server.app.inject({ url: `/api/runs/${second}`, headers: { host: auth.host } })).statusCode).toBe(401);
    const extra = await dispatch(repos[2], 'C');
    expect(await detail(extra)).toMatchObject({ status: 'queued', waitingReason: 'Waiting for execution capacity: active or quarantined writers occupy the profile limit (2).' });
    finish('A first'); await started('A second');
    expect(await detail(second)).toMatchObject({ status: 'running', waitingReason: null });
    expect((await detail(extra)).status).toBe('queued');
    finish('B'); await started('C');
    finish('A second'); finish('C');
    await expect.poll(() => [first, second, independent, extra].some((id) => server!.runner.isLive(id)), { timeout: 30000 }).toBe(false);
    expect(maxRepository).toBe(1); expect(maxGlobal).toBe(2);
    for (const id of [first, second, independent, extra]) expect(await detail(id)).toMatchObject({ status: 'done', waitingReason: null, verifyVerdict: null });
    for (const repo of [...repos, sibling]) expect(git(repo, ['status', '--porcelain'])).toBe('');
    await server.close(); server = await buildServer(env, options);
    const restored: AgentRun[] = (await get('/api/runs')).runs;
    expect(restored).toHaveLength(4); expect(restored.every((row) => row.status === 'done' && row.waitingReason === null)).toBe(true);
    expect(launched).toHaveLength(4);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 120000);
