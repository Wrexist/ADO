import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { Incident } from '@ado/shared';
import { openDb } from '../db';
import { Bus } from '../bus';
import type { AccServer } from '../app';
import { buildServer } from '../app';
import { IncidentDiagnoser, heuristicDiagnosis, type FetchFn } from './diagnoser';
import { IncidentReporter } from './reporter';
import type { SpawnHandle, SpawnOpts, Spawner } from '../runner/spawner';

const ts = '2026-07-12T08:00:00.000Z';
const incident = (over: Partial<Incident> = {}): Incident => ({
  id: 'inc-1',
  ts,
  source: 'server',
  kind: 'route-error',
  message: "Cannot read properties of undefined (reading 'name')",
  status: 'open',
  ...over,
});

type SentBody = { model: string; tools: Array<{ strict?: boolean }>; tool_choice: { type: string; name: string }; messages: { role: string; content: string }[] };
type Captured = { url: string; body: SentBody; headers: Record<string, string> };

/** Fake fetch returning a Messages-API response with one record_diagnosis tool_use block. */
function diagnosisFetch(input: Record<string, unknown>, ok = true, status = 200): { fetch: FetchFn; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) as SentBody, headers: init.headers as Record<string, string> });
    return { ok, status, json: async () => ({ content: [{ type: 'tool_use', name: 'record_diagnosis', input }] }) } as Response;
  }) as unknown as FetchFn;
  return { fetch, calls };
}

const GOOD_DX = { summary: 'undefined access', rootCause: 'a value was undefined', severity: 'high', suggestedFix: 'guard it', prevention: 'validate with zod', confidence: 0.88 };

describe('IncidentDiagnoser', () => {
  it('with no key, produces an honest heuristic diagnosis (never throws)', async () => {
    const d = new IncidentDiagnoser(() => undefined, (async () => { throw new Error('must not call'); }) as unknown as FetchFn);
    const dx = await d.diagnose(incident());
    expect(dx.diagnosedBy).toBe('heuristic');
    expect(dx.rootCause).toMatch(/undefined or null/i); // matched the null-deref pattern
  });

  it('with a key, diagnoses via a forced strict tool call on the top model (parsedBy: claude)', async () => {
    const { fetch, calls } = diagnosisFetch(GOOD_DX);
    const d = new IncidentDiagnoser(() => 'sk-test', fetch);
    const dx = await d.diagnose(incident({ message: 'boom', context: 'GET /api/x' }));
    expect(dx.diagnosedBy).toBe('claude');
    expect(dx.severity).toBe('high');
    expect(dx.confidence).toBe(0.88);
    // convention 5 (top model for debugging), forced structured output, versioned header
    expect(calls[0].body.model).toBe('claude-opus-4-8');
    expect(calls[0].body.tool_choice).toEqual({ type: 'tool', name: 'record_diagnosis' });
    expect(calls[0].body.tools[0].strict).toBe(true);
    expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[0].headers['x-api-key']).toBe('sk-test');
    // convention 11: the incident rides in the user turn as DATA
    expect(calls[0].body.messages[0].content).toContain('boom');
    expect(calls[0].body.messages[0].content).toContain('GET /api/x');
  });

  it('falls back to heuristic on an API error', async () => {
    const { fetch } = diagnosisFetch({}, false, 500);
    const dx = await new IncidentDiagnoser(() => 'sk-test', fetch).diagnose(incident());
    expect(dx.diagnosedBy).toBe('heuristic');
  });

  it('falls back to heuristic when the tool output fails validation', async () => {
    const { fetch } = diagnosisFetch({ summary: 's', severity: 'not-a-severity', confidence: 5 });
    const dx = await new IncidentDiagnoser(() => 'sk-test', fetch).diagnose(incident());
    expect(dx.diagnosedBy).toBe('heuristic');
  });

  it('falls back to heuristic when fetch throws (network/timeout)', async () => {
    const throwing = (async () => { throw new Error('aborted'); }) as unknown as FetchFn;
    const dx = await new IncidentDiagnoser(() => 'sk-test', throwing).diagnose(incident());
    expect(dx.diagnosedBy).toBe('heuristic');
  });
});

describe('heuristicDiagnosis (offline degraded state)', () => {
  it('escalates an uncaughtException to critical severity', () => {
    const dx = heuristicDiagnosis(incident({ kind: 'uncaughtException', message: 'weird failure with no pattern' }));
    expect(dx.severity).toBe('critical');
    expect(dx.confidence).toBeLessThan(0.5); // honest — offline, low confidence
  });

  it('recognizes a network failure and stays modest on an unknown one', () => {
    expect(heuristicDiagnosis(incident({ message: 'fetch failed: ECONNREFUSED' })).rootCause).toMatch(/network/i);
    const unknown = heuristicDiagnosis(incident({ kind: 'route-error', message: 'xyzzy plugh' }));
    expect(unknown.confidence).toBeLessThanOrEqual(0.2); // couldn't identify → says so
  });
});

describe('IncidentReporter', () => {
  it('reports an incident then attaches a diagnosis (both flow through the bus)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const reporter = new IncidentReporter(bus, new IncidentDiagnoser(() => undefined));
    const inc = reporter.report({ source: 'server', kind: 'route-error', message: 'null deref' });
    expect(inc).not.toBeNull();
    // reported synchronously; diagnosed after the background task settles
    expect(bus.snapshot().state.incidents[0].status).toBe('open');
    await reporter.settled();
    const stored = bus.snapshot().state.incidents.find((i) => i.id === inc!.id)!;
    expect(stored.status).toBe('diagnosed');
    expect(stored.diagnosis?.diagnosedBy).toBe('heuristic');
    sqlite.close();
  });

  it('throttles an identical failure to one incident per window, then allows it again', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    let now = 1_000_000;
    const reporter = new IncidentReporter(bus, new IncidentDiagnoser(() => undefined), () => {}, () => now);
    const same = { source: 'server' as const, kind: 'route-error', message: 'same boom' };
    expect(reporter.report(same)).not.toBeNull();
    expect(reporter.report(same)).toBeNull(); // collapsed within the window
    now += 61_000;
    expect(reporter.report(same)).not.toBeNull(); // window elapsed → allowed again
    await reporter.settled();
    expect(bus.snapshot().state.incidents.length).toBe(2);
    sqlite.close();
  });

  it('never throws from report() even if diagnosis rejects (incident stays open)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const boomDx = { diagnose: async () => { throw new Error('dx boom'); } } as unknown as IncidentDiagnoser;
    const reporter = new IncidentReporter(bus, boomDx);
    expect(() => reporter.report({ source: 'web', kind: 'react-render', message: 'x' })).not.toThrow();
    await reporter.settled();
    const st = bus.snapshot().state.incidents;
    expect(st.length).toBe(1);
    expect(st[0].status).toBe('open'); // diagnosis failed → left open, honest
    sqlite.close();
  });
});

// —— endpoints ————————————————————————————————————————————————————————————————

const ENV = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
const HOST = { host: '127.0.0.1:8787' };
const AUTH = { ...HOST, 'x-acc-token': 'test-token' };

const SUCCESS_STREAM = [
  '{"type":"system","subtype":"init"}',
  '{"type":"result","subtype":"success","num_turns":1,"usage":{"input_tokens":10,"output_tokens":5}}',
];
function fakeSpawner(lines: string[], code = 0): Spawner {
  return {
    spawn(_opts: SpawnOpts): SpawnHandle {
      async function* gen() { for (const l of lines) yield l; }
      return { lines: gen(), done: Promise.resolve(code), kill: () => {} };
    },
  };
}

/** Publish a fully-diagnosed incident straight to the bus (deterministic — no async wait). */
function seedDiagnosed(srv: AccServer, id: string): void {
  srv.bus.publish({
    id: `incident:${id}`, type: 'incident.reported', ts, source: { kind: 'app', ref: id },
    payload: { incident: incident({ id, message: `seed ${id}` }) },
  });
  srv.bus.publish({
    id: `incident-dx:${id}`, type: 'incident.diagnosed', ts, source: { kind: 'app', ref: id },
    payload: { incidentId: id, diagnosis: { ...GOOD_DX, diagnosedBy: 'heuristic' } },
  });
}

describe('incident endpoints (self-diagnosis API)', () => {
  let srv: AccServer;
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false, spawner: fakeSpawner(SUCCESS_STREAM) });
  });
  afterAll(async () => { await srv.close(); });

  it('refuses reads and writes without the token', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/incidents', headers: HOST })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'POST', url: '/api/incidents', headers: HOST, payload: { message: 'x' } })).statusCode).toBe(401);
  });

  it('400s a report with no message (no fabricated incident)', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/incidents', headers: AUTH, payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('reports a web incident, lists it, and diagnoses it (heuristic offline)', async () => {
    const res = await srv.app.inject({
      method: 'POST', url: '/api/incidents', headers: AUTH,
      payload: { kind: 'react-render', message: 'Boundary caught: cannot read length of undefined', context: '/ops' },
    });
    expect(res.statusCode).toBe(200);
    const id = res.json().incident.id as string;
    expect(res.json().throttled).toBe(false);

    await srv.incidents.settled(); // let the background diagnosis land
    const list = await srv.app.inject({ method: 'GET', url: '/api/incidents', headers: AUTH });
    const found = (list.json().incidents as Array<{ id: string; status: string; source: string }>).find((i) => i.id === id)!;
    expect(found.source).toBe('web'); // endpoint forces web source
    expect(found.status).toBe('diagnosed');
  });

  it('fix: 404 unknown, 400 undiagnosed, 400 missing repo, 403 non-dispatchable', async () => {
    // 404 — no such incident
    expect((await srv.app.inject({ method: 'POST', url: '/api/incidents/nope/fix', headers: AUTH, payload: { repoId: 'sentinel' } })).statusCode).toBe(404);

    // 400 — reported but not yet diagnosed (publish only the reported event)
    srv.bus.publish({ id: 'incident:undx', type: 'incident.reported', ts, source: { kind: 'app', ref: 'undx' }, payload: { incident: incident({ id: 'undx' }) } });
    expect((await srv.app.inject({ method: 'POST', url: '/api/incidents/undx/fix', headers: AUTH, payload: { repoId: 'sentinel' } })).statusCode).toBe(400);

    // diagnosed incident: 400 missing repoId, then 403 for a repo outside the allow-list
    seedDiagnosed(srv, 'dx1');
    expect((await srv.app.inject({ method: 'POST', url: '/api/incidents/dx1/fix', headers: AUTH, payload: {} })).statusCode).toBe(400);
    expect((await srv.app.inject({ method: 'POST', url: '/api/incidents/dx1/fix', headers: AUTH, payload: { repoId: 'ghost' } })).statusCode).toBe(403);
  });

  it('fix: dispatches a real run when the incident is diagnosed and the repo is dispatchable', async () => {
    // seed a scannable repo so cwdFor resolves it (allow-list), then a diagnosed incident
    srv.bus.publish({
      id: 'repo:sentinel', type: 'repo.upserted', ts, source: { kind: 'scanner', ref: 'sentinel' },
      payload: { repo: { id: 'sentinel', name: 'Sentinel', category: 'app', status: 'active', description: '', branch: 'main', updatedTs: ts } },
    });
    seedDiagnosed(srv, 'dx2');
    const res = await srv.app.inject({ method: 'POST', url: '/api/incidents/dx2/fix', headers: AUTH, payload: { repoId: 'sentinel' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().runId).toBeTruthy(); // a real run was dispatched
  });
});
