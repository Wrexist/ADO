import { afterEach, expect, it, vi } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { HealthChecker } from './health';
import { buildServer } from '../app';
import { systemHealthPct, systemStatusRows } from '../../../web/src/lib/selectors';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('clears replayed health without a credential and treats explicit unknown as no evidence', () => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  bus.publish({ id: 'old', type: 'health.checked', ts: new Date().toISOString(), source: { kind: 'health', ref: 'fixture' }, payload: { service: 'anthropic', state: 'operational' } });
  const checker = new HealthChecker(bus, () => '');
  try {
    checker.start();
    expect(bus.snapshot().state.health.anthropic.state).toBe('unknown');
    const replayed = new Bus(db); replayed.replayFromDb(() => {});
    expect(replayed.snapshot().state.health.anthropic.state).toBe('unknown');
    expect(systemStatusRows(replayed.snapshot().state).find(row => row.id === 'anthropic')?.state).toBe('unknown');
    expect(systemHealthPct(replayed.snapshot().state)).toBe(90);
    const onlyUnknown = { ...replayed.snapshot().state, health: { anthropic: replayed.snapshot().state.health.anthropic } };
    expect(systemHealthPct(onlyUnknown)).toBeNull();
  } finally { checker.stop(); sqlite.close(); }
});

it('ignores a late success after A-to-B-to-A replacement and requires a new check', async () => {
  vi.useFakeTimers();
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  let finish!: (response: Response) => void, key = 'fixture-A';
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValue(new Response(null, { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  const checker = new HealthChecker(bus, () => key);
  try {
    checker.start(); checker.start(); expect(fetcher).toHaveBeenCalledTimes(1);
    key = 'fixture-B'; checker.credentialsChanged(); key = 'fixture-A'; checker.credentialsChanged();
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal; expect(signal.aborted).toBe(true);
    finish(new Response(null, { status: 200 })); await vi.advanceTimersByTimeAsync(0);
    expect(bus.snapshot().state.health.anthropic.state).toBe('unknown');
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(bus.snapshot().state.health.anthropic.state).toBe('degraded');
    expect(fetcher.mock.calls[1][1].redirect).toBe('error');
  } finally { checker.stop(); sqlite.close(); }
});

it('does not publish a late failure after stop', async () => {
  vi.useFakeTimers();
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  let fail!: (reason: Error) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => { fail = reject; })));
  const checker = new HealthChecker(bus, () => 'fixture');
  try {
    checker.start(); checker.stop(); const before = bus.snapshot();
    fail(new Error('late network failure')); await vi.advanceTimersByTimeAsync(60000);
    expect(bus.snapshot()).toEqual(before);
  } finally { checker.stop(); sqlite.close(); }
});

it('clears a successful check when the key disappears on the next tick', async () => {
  vi.useFakeTimers();
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db); let key = 'fixture';
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal('fetch', fetcher);
  const checker = new HealthChecker(bus, () => key);
  try {
    checker.start(); await vi.advanceTimersByTimeAsync(0); expect(bus.snapshot().state.health.anthropic.state).toBe('operational');
    key = ''; await vi.advanceTimersByTimeAsync(60000);
    expect(bus.snapshot().state.health.anthropic.state).toBe('unknown'); expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { checker.stop(); sqlite.close(); }
});

it('invalidates Anthropic health through save/remove API only after a successful credential write', async () => {
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture', dbPath: ':memory:', projectDirs: [], demo: false }, { startSystem: false });
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'fixture' };
  const green = () => server.bus.publish({ id: `fixture-${Math.random()}`, type: 'health.checked', ts: new Date().toISOString(), source: { kind: 'health', ref: 'fixture' }, payload: { service: 'anthropic', state: 'operational' } });
  try {
    green();
    expect((await server.app.inject({ method: 'POST', url: '/api/connections/anthropic', headers, payload: { value: '' } })).statusCode).toBe(400);
    expect(server.bus.snapshot().state.health.anthropic.state).toBe('operational');
    const saved = await server.app.inject({ method: 'POST', url: '/api/connections/anthropic', headers, payload: { value: 'fixture-new-value' } });
    expect(saved.statusCode).toBe(200); expect(saved.json().status).toMatchObject({ configured: true, authentication: 'unverified' });
    expect(server.bus.snapshot().state.health.anthropic.state).toBe('unknown');
    green();
    expect((await server.app.inject({ method: 'DELETE', url: '/api/connections/anthropic', headers })).statusCode).toBe(200);
    expect(server.bus.snapshot().state.health.anthropic.state).toBe('unknown');
  } finally { await server.close(); }
});
