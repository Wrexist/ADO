import { afterEach, expect, it, vi } from 'vitest';
import { openDb } from '../../db';
import { Bus } from '../../bus';
import { buildServer } from '../../app';
import { GitHubSync } from './sync';
import type { GhRepo, GitHubClient } from './types';

const repo: GhRepo = { owner: 'fixture', name: 'repo', description: 'Synthetic lifecycle test', language: 'TypeScript', stargazers: 1, defaultBranch: 'main', pushedAt: '2026-09-28T00:00:00.000Z' };
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const client = (): GitHubClient => ({ listRepos: async () => [repo], openPrCount: async () => 1, openPrForBranch: async () => null, latestRun: async () => ({ id: 1, headSha: 'a'.repeat(40), branch: 'main', workflowName: 'Fixture', status: 'completed', conclusion: 'success' }), branchHead: async () => 'a'.repeat(40), listReleases: async () => [{ id: 1, tag: 'fixture', publishedAt: null }] });
afterEach(() => vi.useRealTimers());

it('clears persisted GitHub health when removing the last credential without starting a client', async () => {
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture', dbPath: ':memory:', projectDirs: [], demo: false }, { startSystem: false });
  try {
    server.bus.publish({ id: 'old-green', type: 'health.checked', ts: new Date().toISOString(), source: { kind: 'health', ref: 'fixture' }, payload: { service: 'github', state: 'operational' } });
    const response = await server.app.inject({ method: 'DELETE', url: '/api/connections/github', headers: { host: '127.0.0.1:8787', 'x-acc-token': 'fixture' } });
    expect(response.statusCode).toBe(200); expect(response.json().status.configured).toBe(false);
    expect(server.bus.snapshot().state.health.github.state).toBe('unknown');
  } finally { await server.close(); }
});

it.each(['repos', 'enrichment', 'releases'] as const)('publishes no new state after stopping at the %s boundary', async boundary => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db), provider = client();
  const entered = deferred<void>(), release = deferred<void>();
  const gate = async <T>(value: T) => { entered.resolve(); await release.promise; return value; };
  if (boundary === 'repos') provider.listRepos = () => gate([repo]);
  if (boundary === 'enrichment') provider.openPrCount = () => gate(9);
  if (boundary === 'releases') provider.listReleases = () => gate([{ id: 2, tag: 'late', publishedAt: null }]);
  const observe = vi.fn(), sync = new GitHubSync(bus, provider, () => {}, observe);
  try {
    const job = sync.sync(); await entered.promise; sync.stop();
    const before = bus.snapshot(), observed = observe.mock.calls.length;
    release.resolve(); await job;
    expect(bus.snapshot()).toEqual(before); expect(observe).toHaveBeenCalledTimes(observed);
    expect(await sync.sync()).toBe(0);
    const replayed = new Bus(db); replayed.replayFromDb(() => {});
    expect(replayed.snapshot().state).toEqual(before.state);
  } finally { sync.stop(); sqlite.close(); }
});

it('shares an in-flight pass and does not start duplicate polling loops', async () => {
  vi.useFakeTimers();
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db), provider = client();
  const response = deferred<GhRepo[]>(); provider.listRepos = vi.fn().mockReturnValue(response.promise);
  const sync = new GitHubSync(bus, provider);
  try {
    const one = sync.sync(), two = sync.sync(); expect(two).toBe(one);
    sync.start(); sync.start(); expect(provider.listRepos).toHaveBeenCalledTimes(1);
    response.resolve([]); await one; await vi.advanceTimersByTimeAsync(60000);
    expect(provider.listRepos).toHaveBeenCalledTimes(2);
    expect(bus.snapshot().state.health.github.state).toBe('operational');
    sync.stop(); await vi.advanceTimersByTimeAsync(180000); expect(provider.listRepos).toHaveBeenCalledTimes(2);
  } finally { sync.stop(); sqlite.close(); }
});

it('ignores a late failure after stop without health, logs or another timer', async () => {
  vi.useFakeTimers();
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db), provider = client();
  const response = deferred<GhRepo[]>(); provider.listRepos = vi.fn().mockReturnValue(response.promise);
  const log = vi.fn(), sync = new GitHubSync(bus, provider, log);
  try {
    sync.start(); sync.stop(); const before = bus.snapshot(); response.reject(new Error('late fixture failure'));
    await vi.advanceTimersByTimeAsync(600000);
    expect(bus.snapshot()).toEqual(before); expect(log).not.toHaveBeenCalled(); expect(provider.listRepos).toHaveBeenCalledTimes(1);
  } finally { sync.stop(); sqlite.close(); }
});

it('credential replacement clears prior health and discards the stopped client response through the real API', async () => {
  const old = deferred<GhRepo[]>(), current = deferred<GhRepo[]>(), provider = client();
  provider.listRepos = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture', dbPath: ':memory:', projectDirs: [], demo: false }, { startSystem: false, githubClient: provider });
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'fixture' };
  try {
    const save = (value: string) => server.app.inject({ method: 'POST', url: '/api/connections/github', headers, payload: { value } });
    expect((await save('fixture-old')).statusCode).toBe(200);
    server.bus.publish({ id: 'fixture-green', type: 'health.checked', ts: new Date().toISOString(), source: { kind: 'health', ref: 'fixture' }, payload: { service: 'github', state: 'operational' } });
    expect((await save('fixture-new')).statusCode).toBe(200);
    expect(server.bus.snapshot().state.health.github.state).toBe('unknown');
    const before = server.bus.snapshot(); old.resolve([repo]);
    await new Promise(resolve => setImmediate(resolve)); expect(server.bus.snapshot()).toEqual(before);
    current.resolve([]); await vi.waitFor(() => expect(server.bus.snapshot().state.health.github.state).toBe('operational'));
    expect(Object.keys(server.bus.snapshot().state.repos)).toEqual([]);
    expect(provider.listRepos).toHaveBeenCalledTimes(2);
  } finally { old.resolve([]); current.resolve([]); await server.close(); }
});
