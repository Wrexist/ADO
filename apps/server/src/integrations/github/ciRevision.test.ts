import { describe, expect, it } from 'vitest';
import { ciRevision, RepoCI } from '@ado/shared';
import { openDb } from '../../db';
import { Bus } from '../../bus';
import { OctokitClient } from './client';
import { ciFromRun } from './map';
import { GitHubSync } from './sync';
import type { GhRepo, GhRun, GitHubClient } from './types';

const OLD = 'a'.repeat(40), NEW = 'b'.repeat(40);
const run = (headSha: string): GhRun => ({ id: 9, headSha, branch: 'main', startedAt: '2026-09-28T10:00:00Z', workflowName: 'CI', status: 'completed', conclusion: 'success' });
const repo: GhRepo = { owner: 'fixture', name: 'app', description: null, language: 'TypeScript', stargazers: 0, defaultBranch: 'Main', pushedAt: null };

describe('CI revision binding (T03)', () => {
  it('carries the run commit, run time and branch head; drops malformed revisions', () => {
    expect(ciFromRun(run(OLD), NEW)).toEqual({ label: 'CI', pct: 100, state: 'success', headSha: OLD, runTs: '2026-09-28T10:00:00.000Z', branchHeadSha: NEW });
    const bad = ciFromRun({ ...run('not-a-sha'), startedAt: 'garbage' }, 'ABC');
    expect(bad).toEqual({ label: 'CI', pct: 100, state: 'success' });
    expect(ciRevision(bad)).toBe('unverified');
    expect(RepoCI.safeParse({ label: 'CI', pct: 100, state: 'success', headSha: 'A'.repeat(40) }).success).toBe(false);
  });

  it('marks an older green run as older after a push, and unverified when the head is unreadable', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    let head: string | Error = OLD;
    const branches: string[] = [];
    const client: GitHubClient = {
      listRepos: async () => [repo], openPrCount: async () => 0, openPrForBranch: async () => null,
      latestRun: async () => run(OLD), listReleases: async () => [],
      branchHead: async (_o, _n, branch) => { branches.push(branch); if (head instanceof Error) throw head; return head; },
    };
    const sync = new GitHubSync(bus, client);
    const ci = () => Object.values(bus.snapshot().state.repos)[0]!.ci!;

    await sync.sync();
    expect(ciRevision(ci())).toBe('current');
    expect(branches).toEqual(['Main']); // exact default-branch name, never a hard-coded main

    head = NEW; // pushed; GitHub has not started a run for the new commit yet
    await sync.sync();
    expect(ci()).toMatchObject({ state: 'success', headSha: OLD, branchHeadSha: NEW });
    expect(ciRevision(ci())).toBe('older');

    head = new Error('rate limited');
    await sync.sync();
    expect(ci().branchHeadSha).toBeUndefined();
    expect(ciRevision(ci())).toBe('unverified');
    expect(bus.snapshot().state.health.github?.state).not.toBe('operational');
    sqlite.close();
  });

  it('reads the branch head through the adapter and rejects a mismatched branch or SHA', async () => {
    const reply = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;
    expect(await new OctokitClient('t', reply({ name: 'Main', commit: { sha: NEW } })).branchHead('o', 'r', 'Main')).toBe(NEW);
    expect(await new OctokitClient('t', reply({ name: 'main', commit: { sha: NEW } })).branchHead('o', 'r', 'Main')).toBeNull();
    expect(await new OctokitClient('t', reply({ name: 'Main', commit: { sha: 'short' } })).branchHead('o', 'r', 'Main')).toBeNull();
  });
});
