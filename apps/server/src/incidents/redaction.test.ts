import { expect, it, vi } from 'vitest';
import { openDb } from '../db';
import { events } from '../db/schema';
import { Bus } from '../bus';
import { IncidentReporter } from './reporter';
import { IncidentDiagnoser } from './diagnoser';
import { buildServer } from '../app';

it('redacts incident input before diagnosis, and provider output before event persistence', async () => {
  const secret = 'CANARY/private value?&"tail';
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  const diagnoser = new IncidentDiagnoser(() => undefined);
  let received = '';
  vi.spyOn(diagnoser, 'diagnose').mockImplementation(async (incident) => {
    received = JSON.stringify(incident);
    return { summary: secret, rootCause: secret, suggestedFix: secret, prevention: secret, severity: 'low', confidence: 0.5, diagnosedBy: 'heuristic' };
  });
  const reporter = new IncidentReporter(bus, diagnoser, undefined, undefined, () => [secret]);
  try {
    const incident = reporter.report({ source: 'server', kind: secret, message: secret, stack: secret, context: `https://example.invalid/?token=${encodeURIComponent(secret)}` });
    expect(incident).not.toBeNull();
    await reporter.settled();
    const exposed = JSON.stringify({ received, incident, events: db.select().from(events).all(), snapshot: bus.snapshot() });
    expect(exposed).not.toContain('CANARY');
    expect(exposed).toContain('[redacted]');
  } finally { sqlite.close(); }
});

it('redacts an unexpected route failure in its response and incident snapshot', async () => {
  const secret = 'CANARY/private value?&"tail';
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: secret, dbPath: ':memory:', demo: false, projectDirs: [] });
  server.app.get('/canary-fixture', async () => { throw new Error(`Failure ${secret}`); });
  try {
    const response = await server.app.inject({ method: 'GET', url: '/canary-fixture', headers: { host: '127.0.0.1:8787', 'x-acc-token': secret } });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('CANARY');
    expect(response.body).toContain('[redacted]');
    await server.incidents.settled();
    expect(JSON.stringify(server.bus.snapshot())).not.toContain('CANARY');
  } finally { await server.close(); }
});
