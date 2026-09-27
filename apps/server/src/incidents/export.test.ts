import { expect, it } from 'vitest';
import { incidentReport } from './export';
import { buildServer } from '../app';

it('projects only bounded diagnostic fields and redacts before cutting text', () => {
  const secret = 'CANARY/private value?&"tail';
  const value = 'x'.repeat(7990) + secret;
  const report = incidentReport({ id: 'fixture', ts: new Date().toISOString(), source: 'server', kind: secret, status: 'diagnosed', message: value, stack: secret, context: `https://example.invalid/?v=${encodeURIComponent(secret)}`, credentialFile: secret, diagnosis: { summary: value, rootCause: secret, suggestedFix: secret, prevention: secret, severity: 'low', confidence: 0.5, diagnosedBy: 'heuristic', rawResponse: secret } }, [secret]);
  const serialized = JSON.stringify(report);
  expect(serialized).not.toContain('CANARY');
  expect(serialized).not.toContain('credentialFile'); expect(serialized).not.toContain('rawResponse');
  expect(report.incident.message).toHaveLength(8000);
  expect(report.incident.stack).toBe('[redacted]');
  expect(report.incident.context).toContain('v=[redacted]');
});

it('authenticates report downloads and masks a captured incident through API and export without starting a run', async () => {
  const secret = 'CANARY-export value?&"tail';
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: secret, dbPath: ':memory:', demo: false, projectDirs: [] }, { startSystem: false, startScanner: false, spawner: { spawn() { throw new Error('must not spawn'); } } });
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': secret };
  try {
    const captured = await server.app.inject({ method: 'POST', url: '/api/incidents', headers, payload: { kind: 'DEMO export fixture', message: `provider error ${secret}`, stack: secret, context: `https://example.invalid/?v=${encodeURIComponent(secret)}` } });
    expect(captured.statusCode).toBe(200);
    const id = captured.json().incident.id, url = `/api/incidents/${id}/export`;
    await server.incidents.settled();
    expect((await server.app.inject({ url, headers: { host: headers.host } })).statusCode).toBe(401);
    expect((await server.app.inject({ url, headers: { ...headers, origin: 'https://hostile.invalid' } })).statusCode).toBe(403);
    expect((await server.app.inject({ url: '/api/incidents/missing/export', headers })).statusCode).toBe(404);
    const exported = await server.app.inject({ url, headers });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['cache-control']).toBe('no-store');
    expect(exported.headers['content-disposition']).toContain('attachment');
    expect(exported.json()).toMatchObject({ format: 'controlos-incident-v1', incident: { id, message: 'provider error [redacted]', stack: '[redacted]' } });
    const exposed = captured.body + exported.body + (await server.app.inject({ url: '/api/incidents', headers })).body + JSON.stringify(server.bus.snapshot());
    expect(exposed).not.toContain('CANARY'); expect(exposed).toContain('[redacted]');
    expect((await server.app.inject({ url: '/api/runs', headers })).json().runs).toEqual([]);
  } finally { await server.close(); }
});
