import { describe, expect, it } from 'vitest';
import { openDb } from '../../db';
import { Bus } from '../../bus';
import { ciFromRun, categoryFromLanguage, slug, toLanguage } from './map';
import { GitHubSync } from './sync';
import type { GhRelease, GhRepo, GhRun, GitHubClient } from './types';

describe('github mappers (pure)', () => {
  it('maps run status/conclusion to the DATA_MAP CI bar', () => {
    expect(ciFromRun({ workflowName: 'CI', status: 'queued', conclusion: null })).toMatchObject({ pct: 0, state: 'queued' });
    expect(ciFromRun({ workflowName: 'CI', status: 'in_progress', conclusion: null })).toMatchObject({ pct: 0, state: 'running' });
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: 'success' })).toMatchObject({ pct: 100, state: 'success' });
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: 'failure' })).toMatchObject({ state: 'failed' });
    // cancelled/skipped are terminal but NOT failures — never a false red bar
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: 'cancelled' })).toMatchObject({ state: 'cancelled' });
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: null })).toMatchObject({ state: 'unknown' });
  });

  it('normalizes language + infers category', () => {
    expect(toLanguage('TypeScript')).toBe('typescript');
    expect(toLanguage('Rust')).toBeUndefined(); // unknown → no dot, honest
    expect(categoryFromLanguage('Swift')).toBe('app');
    expect(categoryFromLanguage('Python')).toBe('service');
  });

  it('slugs names stably', () => {
    expect(slug('Dynasty Manager')).toBe('dynasty-manager');
  });
});

/** Deterministic fake — records call counts so we can assert ETag-style caching upstream. */
class FakeClient implements GitHubClient {
  calls = { repos: 0, prs: 0, runs: 0, releases: 0 };
  constructor(private repos: GhRepo[], private runs: Record<string, GhRun | null> = {}, private rels: Record<string, GhRelease[]> = {}, public heads: Record<string, string | null> = {}) {}
  async listRepos() { this.calls.repos++; return this.repos; }
  async openPrCount() { this.calls.prs++; return 2; }
  async openPrForBranch() { return null; }
  async latestRun(_o: string, n: string) { this.calls.runs++; return this.runs[n] ?? null; }
  async branchHead(_o: string, n: string) { return this.heads[n] ?? null; }
  async listReleases(_o: string, n: string) { this.calls.releases++; return this.rels[n] ?? []; }
}

const REPO = (name: string, extra: Partial<GhRepo> = {}): GhRepo => ({
  owner: 'wrexist', name, description: 'x', language: 'TypeScript',
  stargazers: 5, defaultBranch: 'main', pushedAt: '2026-07-09T00:00:00.000Z', ...extra,
});

describe('github sync (fake client)', () => {
  it('ENRICHES a scanner repo without clobbering its base fields', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    // scanner already put SENTINEL on the bus with a category from ops.yml
    bus.publish({
      id: 'scan:sentinel', type: 'repo.upserted', ts: '2026-07-09T00:00:00.000Z',
      source: { kind: 'scanner', ref: '/dev/sentinel' },
      payload: { repo: { id: 'sentinel', name: 'SENTINEL', localPath: '/dev/sentinel', githubFullName: 'wrexist/sentinel', category: 'game', status: 'active', description: 'Tactical defense game', branch: 'main', updatedTs: '2026-07-09T00:00:00.000Z' } },
    });

    const client = new FakeClient(
      [REPO('SENTINEL')],
      { SENTINEL: { workflowName: 'Build & Test', status: 'completed', conclusion: 'success' } },
      { SENTINEL: [{ id: 42, tag: 'v1.0.0', publishedAt: '2026-07-09T01:00:00.000Z' }] },
    );
    const sync = new GitHubSync(bus, client);
    await sync.sync();

    const repo = bus.snapshot().state.repos.sentinel;
    expect(repo.category).toBe('game'); // scanner base preserved (NOT overwritten to 'web')
    expect(repo.description).toBe('Tactical defense game');
    expect(repo.stars).toBe(5); // enriched
    expect(repo.prs).toBe(2); // enriched
    expect(repo.ci).toMatchObject({ state: 'success', pct: 100 }); // enriched
    expect(bus.snapshot().state.deployments).toHaveLength(0);
    expect(bus.snapshot().state.activity.some((d) => d.id === 'sentinel-42')).toBe(true);
    expect(bus.snapshot().state.health.github?.state).toBe('operational');
    sqlite.close();
  });

  it('CREATES a base repo for a GitHub repo with no local match (token-only mode)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const client = new FakeClient([REPO('Bloom', { language: 'Swift' })]);
    await new GitHubSync(bus, client).sync();
    const repo = Object.values(bus.snapshot().state.repos).find((r) => r.githubFullName === 'wrexist/bloom')!;
    expect(repo).toBeDefined();
    expect(repo.category).toBe('app'); // inferred from Swift
    expect(repo.stars).toBe(5);
    sqlite.close();
  });

  it('release records are idempotent across repeated syncs', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const client = new FakeClient([REPO('Atlas')], {}, { Atlas: [{ id: 7, tag: 'v2', publishedAt: '2026-07-09T02:00:00.000Z' }] });
    const sync = new GitHubSync(bus, client);
    await sync.sync();
    await sync.sync();
    expect(bus.snapshot().state.deployments).toHaveLength(0);
    expect(bus.snapshot().state.activity.filter((d) => d.detail.includes('Release v2')).length).toBe(1);
    sqlite.close();
  });
});

it('keeps same-name owners distinct and publishes actual CI failures once', async () => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  let failures = 0;
  bus.subscribe((frame) => { if (frame.kind === 'evt' && frame.evt.type === 'build.updated' && frame.evt.payload.build.state === 'failed') failures++; });
  const client = new FakeClient([REPO('app'), REPO('app', { owner: 'someone-else' })], { app: { id: 123, headSha: 'a'.repeat(40), branch: 'main', workflowName: 'CI', status: 'completed', conclusion: 'failure' } });
  const sync = new GitHubSync(bus, client); await sync.sync(); await sync.sync();
  expect(Object.keys(bus.snapshot().state.repos)).toHaveLength(2);
  expect(failures).toBe(2); // one per owner, not per repeated poll
  expect(Object.values(bus.snapshot().state.builds).every((b) => b.headSha === 'a'.repeat(40))).toBe(true);
  sqlite.close();
});

it('keys GitHub repositories by numeric id across renames and reused names (T01)', async () => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  const run = (id: number) => ({ id, headSha: 'a'.repeat(40), branch: 'main', workflowName: 'CI', status: 'completed', conclusion: 'failure' });
  const client = new FakeClient([REPO('app', { externalId: '1' })], { app: run(11) });
  const sync = new GitHubSync(bus, client);
  await sync.sync();
  const repos = () => Object.values(bus.snapshot().state.repos);
  const first = repos()[0]!;
  expect(first).toMatchObject({ id: 'github-1', githubRepoId: '1', name: 'app' });

  // Repo 1 renamed to app2; a different repo 2 now takes the name "app".
  Object.assign(client, { repos: [REPO('app2', { externalId: '1' }), REPO('app', { externalId: '2' })], runs: { app2: run(12), app: run(21) } });
  await sync.sync();
  expect(repos().map((r) => [r.id, r.name, r.githubRepoId]).sort()).toEqual([['github-1', 'app2', '1'], ['github-2', 'app', '2']]);
  const builds = Object.values(bus.snapshot().state.builds);
  expect(builds.filter((b) => b.repo === 'github-1').map((b) => b.workflowRunId).sort()).toEqual([11, 12]);
  expect(builds.filter((b) => b.repo === 'github-2').map((b) => b.workflowRunId)).toEqual([21]);
  sqlite.close();
});

it('adopts a legacy name-keyed entry once, without moving a local checkout to a reused name (T01)', async () => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  const legacyId = `github-${Buffer.from('wrexist/old').toString('base64url')}`;
  bus.publish({ id: 'legacy', type: 'repo.upserted', ts: '2026-07-09T00:00:00.000Z', source: { kind: 'github', ref: 'wrexist/old' },
    payload: { repo: { id: legacyId, name: 'old', category: 'web', status: 'active', description: '', branch: 'main', updatedTs: '2026-07-09T00:00:00.000Z', githubFullName: 'wrexist/old' } } });
  bus.publish({ id: 'local', type: 'repo.upserted', ts: '2026-07-09T00:00:00.000Z', source: { kind: 'scanner', ref: '/dev/tool' },
    payload: { repo: { id: 'tool', name: 'tool', localPath: '/dev/tool', githubFullName: 'wrexist/tool', githubRepoId: '7', category: 'web', status: 'active', description: '', branch: 'main', updatedTs: '2026-07-09T00:00:00.000Z' } } });
  // "old" upgrades in place; "tool" is now a different repository (id 8) reusing the name.
  await new GitHubSync(bus, new FakeClient([REPO('old', { externalId: '5' }), REPO('tool', { externalId: '8' })])).sync();
  const state = bus.snapshot().state.repos;
  expect(state[legacyId]).toMatchObject({ githubRepoId: '5' });
  expect(state.tool).toMatchObject({ githubRepoId: '7', localPath: '/dev/tool' });
  expect(state['github-8']).toMatchObject({ githubRepoId: '8', githubFullName: 'wrexist/tool' });
  sqlite.close();
});
