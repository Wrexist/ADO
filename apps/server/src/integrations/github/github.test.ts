import { describe, expect, it } from 'vitest';
import { openDb } from '../../db';
import { Bus } from '../../bus';
import { ciFromRun, categoryFromLanguage, slug, toLanguage } from './map';
import { GitHubSync } from './sync';
import type { GhRelease, GhRepo, GhRun, GitHubClient } from './types';

describe('github mappers (pure)', () => {
  it('maps run status/conclusion to the DATA_MAP CI bar', () => {
    expect(ciFromRun({ workflowName: 'CI', status: 'queued', conclusion: null })).toMatchObject({ pct: 10, state: 'queued' });
    expect(ciFromRun({ workflowName: 'CI', status: 'in_progress', conclusion: null })).toMatchObject({ pct: 50, state: 'running' });
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: 'success' })).toMatchObject({ pct: 100, state: 'success' });
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: 'failure' })).toMatchObject({ state: 'failed' });
    // cancelled/skipped are terminal but NOT failures — never a false red bar
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: 'cancelled' })).toMatchObject({ state: 'queued' });
    expect(ciFromRun({ workflowName: 'CI', status: 'completed', conclusion: null })).toMatchObject({ state: 'queued' });
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
  constructor(private repos: GhRepo[], private runs: Record<string, GhRun | null> = {}, private rels: Record<string, GhRelease[]> = {}) {}
  async listRepos() { this.calls.repos++; return this.repos; }
  async openPrCount() { this.calls.prs++; return 2; }
  async latestRun(_o: string, n: string) { this.calls.runs++; return this.runs[n] ?? null; }
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
      payload: { repo: { id: 'sentinel', name: 'SENTINEL', category: 'game', status: 'active', description: 'Tactical defense game', branch: 'main', updatedTs: '2026-07-09T00:00:00.000Z' } },
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
    expect(bus.snapshot().state.deployments.some((d) => d.id === 'sentinel-42')).toBe(true);
    expect(bus.snapshot().state.health.github?.state).toBe('operational');
    sqlite.close();
  });

  it('CREATES a base repo for a GitHub repo with no local match (token-only mode)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const client = new FakeClient([REPO('Bloom', { language: 'Swift' })]);
    await new GitHubSync(bus, client).sync();
    const repo = bus.snapshot().state.repos.bloom;
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
    expect(bus.snapshot().state.deployments.filter((d) => d.id === 'atlas-7').length).toBe(1);
    sqlite.close();
  });
});
