import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '../../db';
import { Bus } from '../../bus';
import { GitHubRateLimited, GitHubSync, rateLimitWait } from './sync';
import type { GhRepo, GitHubClient } from './types';

const NOW = Date.parse('2026-09-29T10:00:00Z');
const limit = (status: number, headers: Record<string, string>) => Object.assign(new Error('limited'), { status, response: { headers } });
const repo = (name: string): GhRepo => ({ owner: 'fixture', name, description: null, language: null, stargazers: 1, defaultBranch: 'main', pushedAt: null });

afterEach(() => { vi.useRealTimers(); });

describe('GitHub unavailable / rate limited (T34)', () => {
  it('reads GitHub rate-limit signals and bounds the wait', () => {
    expect(rateLimitWait(limit(429, { 'retry-after': '120' }), NOW)).toBe(120_000);
    expect(rateLimitWait(limit(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 300) }), NOW)).toBe(300_000);
    expect(rateLimitWait(limit(403, { 'retry-after': '1' }), NOW)).toBe(60_000);
    expect(rateLimitWait(limit(429, { 'retry-after': '999999' }), NOW)).toBe(3_600_000);
    expect(rateLimitWait(limit(403, { 'x-ratelimit-remaining': '12' }), NOW)).toBeNull(); // permission error, not a limit
    expect(rateLimitWait(new Error('network'), NOW)).toBeNull();
  });

  it('stops the pass at the first rate limit, keeps prior data and waits for the reset', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    let limited = false;
    const calls: string[] = [];
    const client: GitHubClient = {
      listRepos: async () => [repo('a'), repo('b'), repo('c')],
      openPrCount: async (_o, n) => { calls.push(`prs:${n}`); if (limited) throw limit(429, { 'retry-after': '600' }); return 1; },
      openPrForBranch: async () => null, latestRun: async () => null, branchHead: async () => null,
      listReleases: async (_o, n) => { calls.push(`rel:${n}`); return []; },
    };
    const sync = new GitHubSync(bus, client);
    await sync.sync();
    const before = JSON.stringify(bus.snapshot().state.repos);
    expect(bus.snapshot().state.health.github).toMatchObject({ state: 'operational' });
    const okTs = bus.snapshot().state.health.github!.lastOkTs;

    limited = true; calls.length = 0;
    await expect(sync.sync()).rejects.toBeInstanceOf(GitHubRateLimited);
    expect(calls).toEqual(['prs:a']); // no further repo or release calls after the limit
    expect(JSON.stringify(bus.snapshot().state.repos)).toBe(before);

    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.nextDelayMs).toBe(600_000);
    expect(bus.snapshot().state.health.github).toMatchObject({ state: 'degraded', lastOkTs: okTs });
    calls.length = 0;
    await vi.advanceTimersByTimeAsync(599_000);
    expect(calls).toEqual([]); // nothing retried before GitHub's reset
    sync.stop(); sqlite.close();
  });

  it('backs off after a partial pass instead of polling at the base rate', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { db, sqlite } = openDb(':memory:');
    const client: GitHubClient = {
      listRepos: async () => [repo('a')], openPrCount: async () => { throw new Error('502'); },
      openPrForBranch: async () => null, latestRun: async () => null, branchHead: async () => null, listReleases: async () => [],
    };
    const sync = new GitHubSync(new Bus(db), client);
    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.nextDelayMs).toBe(120_000);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sync.nextDelayMs).toBe(240_000);
    sync.stop(); sqlite.close();
  });
});
