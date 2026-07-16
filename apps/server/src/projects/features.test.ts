import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GhPr, GhRelease, GhRepo, GhRun, GitHubClient } from '../integrations/github/types';
import type { AccServer } from '../app';
import { buildServer } from '../app';
import type { SpawnHandle, SpawnOpts, Spawner } from '../runner/spawner';
import { ProjectSettingsStore } from './settings';
import { GithubCloner, parseGithubRepo, type ExecFn } from './github';

const ts = '2026-07-16T08:00:00.000Z';

describe('ProjectSettingsStore (catalog defaults + stored deltas)', () => {
  it('defaults from the catalog, stores deltas, persists, and composes the full map', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acc-pset-'));
    const file = join(dir, 'project-settings.json');
    const s = new ProjectSettingsStore(file);
    // catalog defaults: agents/automations/notifications ON, autoReview OFF
    expect(s.isEnabled('sentinel', 'agents')).toBe(true);
    expect(s.isEnabled('sentinel', 'autoReview')).toBe(false);
    s.set('sentinel', 'agents', false);
    expect(s.isEnabled('sentinel', 'agents')).toBe(false);
    expect(s.isEnabled('other-repo', 'agents')).toBe(true); // per-repo, not global
    // a fresh store reads the persisted deltas
    expect(new ProjectSettingsStore(file).isEnabled('sentinel', 'agents')).toBe(false);
    expect(s.map('sentinel')).toMatchObject({ agents: false, automations: true, notifications: true });
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('parseGithubRepo (owner/repo · https · ssh)', () => {
  it('accepts the three forms and normalizes .git', () => {
    expect(parseGithubRepo('wrexist/ado')).toEqual({ owner: 'wrexist', repo: 'ado' });
    expect(parseGithubRepo('https://github.com/Wrexist/ADO')).toEqual({ owner: 'Wrexist', repo: 'ADO' });
    expect(parseGithubRepo('https://github.com/wrexist/ado.git/')).toEqual({ owner: 'wrexist', repo: 'ado' });
    expect(parseGithubRepo('git@github.com:wrexist/my-repo.git')).toEqual({ owner: 'wrexist', repo: 'my-repo' });
  });

  it('rejects everything else (no shell/path tricks reach the clone)', () => {
    for (const bad of ['', 'not a repo', 'https://gitlab.com/a/b', 'owner/', '/repo', 'a/b/c', 'owner/..', '../../etc', 'owner/repo; rm -rf /', '--upload-pack=x/y']) {
      expect(parseGithubRepo(bad)).toBeNull();
    }
  });
});

describe('GithubCloner (token in env, never argv or URL)', () => {
  it('clones with the clean https URL; the token rides ONLY in env config', async () => {
    const calls: Array<{ cmd: string; args: string[]; env?: NodeJS.ProcessEnv }> = [];
    const fake: ExecFn = async (cmd, args, opts) => {
      calls.push({ cmd, args, env: opts.env });
      return { stdout: '' };
    };
    const dir = mkdtempSync(join(tmpdir(), 'acc-clone-'));
    const dest = await new GithubCloner(fake).clone(dir, { owner: 'wrexist', repo: 'ado' }, 'ghp_secret');
    expect(dest).toBe(join(dir, 'ado'));
    const c = calls[0];
    expect(c.args).toEqual(['clone', '--', 'https://github.com/wrexist/ado.git', dest]);
    expect(JSON.stringify(c.args)).not.toContain('ghp_secret'); // never in argv
    expect(c.env?.GIT_TERMINAL_PROMPT).toBe('0'); // never hangs on a prompt
    expect(c.env?.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
    expect(c.env?.GIT_CONFIG_VALUE_0).toContain('basic'); // auth via env header
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses an existing destination and keeps failure messages token-free', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'acc-clone2-'));
    mkdirSync(join(dir, 'ado'));
    await expect(new GithubCloner(async () => ({ stdout: '' })).clone(dir, { owner: 'w', repo: 'ado' })).rejects.toThrow(/already exists/);
    const failing: ExecFn = async () => {
      throw new Error('fatal: could not read Username for https://github.com: terminal prompts disabled');
    };
    await expect(new GithubCloner(failing).clone(dir, { owner: 'w', repo: 'priv' }, 'ghp_secret')).rejects.toThrow(/may be private/);
    rmSync(dir, { recursive: true, force: true });
  });
});

// —— endpoints ————————————————————————————————————————————————————————————————

const ENV = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
const HOST = { host: '127.0.0.1:8787' };
const AUTH = { ...HOST, 'x-acc-token': 'test-token' };

function fakeSpawner(): Spawner {
  return {
    spawn(_opts: SpawnOpts): SpawnHandle {
      async function* gen() { yield '{"type":"system","subtype":"init"}'; }
      return { lines: gen(), done: Promise.resolve(0), kill: () => {} };
    },
  };
}

/** Fake GitHub client for the /git endpoint's PR check. */
class FakeGh implements GitHubClient {
  constructor(private pr: GhPr | null) {}
  async listRepos(): Promise<GhRepo[]> { return []; }
  async openPrCount(): Promise<number> { return 0; }
  async openPrForBranch(): Promise<GhPr | null> { return this.pr; }
  async latestRun(): Promise<GhRun | null> { return null; }
  async listReleases(): Promise<GhRelease[]> { return []; }
}

function makeGitRepo(root: string, name: string, remote?: string): string {
  const repoDir = join(root, name);
  mkdirSync(repoDir, { recursive: true });
  const g = (args: string[]) => execFileSync('git', args, { cwd: repoDir, stdio: 'ignore' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 't@t']);
  g(['config', 'user.name', 't']);
  writeFileSync(join(repoDir, 'README.md'), `# ${name}\n`);
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'init']);
  if (remote) g(['remote', 'add', 'origin', remote]);
  return repoDir;
}

describe('project settings + git endpoints', () => {
  let srv: AccServer;
  let root: string;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'acc-feat-'));
    makeGitRepo(root, 'linked-repo', 'https://github.com/wrexist/linked-repo.git');
    makeGitRepo(root, 'local-repo');
    srv = await buildServer(ENV, { startSystem: false, spawner: fakeSpawner(), githubClient: new FakeGh({ number: 7, title: 'Fix waves', url: 'https://github.com/wrexist/linked-repo/pull/7', mergeable: true, checks: 'passing' }) });
    // scan the folder so both repos are allow-listed
    await srv.app.inject({ method: 'POST', url: '/api/projects', headers: AUTH, payload: { dir: root } });
    // an unscanned repo that exists only in bus state (like a demo/github-only repo)
    srv.bus.publish({
      id: 'repo:ghost-repo', type: 'repo.upserted', ts, source: { kind: 'github', ref: 'ghost-repo' },
      payload: { repo: { id: 'ghost-repo', name: 'Ghost', category: 'app', status: 'active', description: '', branch: 'main', updatedTs: ts } },
    });
  });
  afterAll(async () => {
    await srv.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('settings: token-gated, 404 unknown, defaults on first read', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/projects/linked-repo/settings', headers: HOST })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'GET', url: '/api/projects/nope/settings', headers: AUTH })).statusCode).toBe(404);
    const res = await srv.app.inject({ method: 'GET', url: '/api/projects/linked-repo/settings', headers: AUTH });
    expect(res.json().features).toEqual({ agents: true, autoReview: false, automations: true, notifications: true });
  });

  it('settings: validates the patch and persists a toggle', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/projects/linked-repo/settings', headers: AUTH, payload: { feature: 'nope', enabled: true } })).statusCode).toBe(400);
    const res = await srv.app.inject({ method: 'POST', url: '/api/projects/linked-repo/settings', headers: AUTH, payload: { feature: 'notifications', enabled: false } });
    expect(res.statusCode).toBe(200);
    expect(res.json().features.notifications).toBe(false);
  });

  it('turning agents off blocks EVERY dispatch path through the runner choke point', async () => {
    await srv.app.inject({ method: 'POST', url: '/api/projects/local-repo/settings', headers: AUTH, payload: { feature: 'agents', enabled: false } });
    const res = await srv.app.inject({ method: 'POST', url: '/api/dispatch', headers: AUTH, payload: { repoId: 'local-repo', task: 'do something' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/turned off .* Settings/);
    // flip back on → dispatch works again (fake spawner)
    await srv.app.inject({ method: 'POST', url: '/api/projects/local-repo/settings', headers: AUTH, payload: { feature: 'agents', enabled: true } });
    expect((await srv.app.inject({ method: 'POST', url: '/api/dispatch', headers: AUTH, payload: { repoId: 'local-repo', task: 'x' } })).statusCode).toBe(200);
  });

  it('autoReview toggle delegates to the engine (baseline seeded for a scanned repo; honest 403 for unscanned)', async () => {
    const on = await srv.app.inject({ method: 'POST', url: '/api/projects/local-repo/settings', headers: AUTH, payload: { feature: 'autoReview', enabled: true } });
    expect(on.statusCode).toBe(200);
    expect(on.json().features.autoReview).toBe(true);
    // and the autoreview settings endpoint agrees (single source of truth)
    const arv = await srv.app.inject({ method: 'GET', url: '/api/autoreview', headers: AUTH });
    const row = (arv.json().settings as Array<{ repoId: string; enabled: boolean; lastSha: string | null }>).find((s) => s.repoId === 'local-repo')!;
    expect(row.enabled).toBe(true);
    expect(row.lastSha).toMatch(/^[0-9a-f]{40}$/); // baseline seeded at enable
    // unscanned (state-only) repo → the engine's allow-list refuses honestly
    expect((await srv.app.inject({ method: 'POST', url: '/api/projects/ghost-repo/settings', headers: AUTH, payload: { feature: 'autoReview', enabled: true } })).statusCode).toBe(403);
  });

  it('git info: branch + github remote parsed + newPrUrl + open PR via the client', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/api/projects/linked-repo/git', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const info = res.json();
    expect(info.branch).toBe('main');
    expect(info.github.owner).toBe('wrexist');
    expect(info.github.webUrl).toBe('https://github.com/wrexist/linked-repo');
    expect(info.github.newPrUrl).toContain('/compare/main?expand=1');
    expect(info.prState).toBe('checked');
    expect(info.openPr).toMatchObject({ number: 7, title: 'Fix waves', mergeable: true, checks: 'passing' });
  });

  it('github clone: a chosen destination must be a TRACKED folder (never an arbitrary path)', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/projects/github', headers: AUTH, payload: { repo: 'wrexist/some-repo', dir: '/tmp/not-tracked-anywhere' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tracked project folders/);
  });

  it('git info: honest states — no remote → not-github; unscanned → 404', async () => {
    const local = await srv.app.inject({ method: 'GET', url: '/api/projects/local-repo/git', headers: AUTH });
    expect(local.json().github).toBeNull();
    expect(local.json().prState).toBe('not-github');
    expect((await srv.app.inject({ method: 'GET', url: '/api/projects/ghost-repo/git', headers: AUTH })).statusCode).toBe(404);
  });

  it('github clone endpoint: validates input and requires a projects folder', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/projects/github', headers: HOST, payload: { repo: 'a/b' } })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'POST', url: '/api/projects/github', headers: AUTH, payload: {} })).statusCode).toBe(400);
    const bad = await srv.app.inject({ method: 'POST', url: '/api/projects/github', headers: AUTH, payload: { repo: 'https://gitlab.com/a/b' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/not a GitHub repository/);
  });
});

describe('github clone endpoint without any projects folder', () => {
  it('400s with the actionable "add a projects folder first" message', async () => {
    // The project-dirs store file is per-PID — wipe it so the folder added by the previous
    // describe block (same test process) doesn't leak into this "fresh install" server.
    rmSync(join(tmpdir(), `acc-projectdirs-${process.pid}.json`), { force: true });
    const srv = await buildServer(ENV, { startSystem: false, spawner: fakeSpawner() });
    const res = await srv.app.inject({ method: 'POST', url: '/api/projects/github', headers: AUTH, payload: { repo: 'wrexist/ado' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/add a projects folder first/);
    await srv.close();
  });
});
