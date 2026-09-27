import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, executionLocks } from '../db/schema';
import { backupDatabase, restoreBackup } from './index';
import { buildServer, type AccServer } from '../app';
import { recoveryMessage } from './recovery';

it('opens restored history without claiming queued jobs, reconciling locks or enabling mutations', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-restore-review-'));
  let server: AccServer | undefined;
  const source = openDb(join(root, 'source.sqlite'));
  const queued = { id: 'queued', repoId: 'fixture', task: 'Do not restart', model: 'default', status: 'queued', engineVersion: 1, startedTs: new Date().toISOString() };
  source.db.insert(runs).values([queued, { ...queued, id: 'running', status: 'running' }]).run();
  source.db.insert(executionLocks).values({ resource: 'fixture', owner: 'previous-owner', runId: 'running', acquiredTs: queued.startedTs }).run();
  const originalRuns = source.sqlite.prepare('SELECT * FROM runs ORDER BY id').all();
  const originalLocks = source.sqlite.prepare('SELECT * FROM execution_locks').all();
  const backup = backupDatabase(source.sqlite, join(root, 'backups'), { dataDir: root }); source.sqlite.close();
  const restored = join(root, 'restored'); restoreBackup(backup.file, restored);
  let starts = 0;
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'restore-fixture', dbPath: join(restored, 'acc.sqlite'), projectDirs: [root], demo: false };
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': env.accToken };
  try {
    for (let pass = 0; pass < 2; pass++) {
      server = await buildServer(env, { startSystem: true, startScanner: true, spawner: { spawn() { starts++; throw new Error('Restored job started'); } } });
      expect(server.scanner).toBeNull(); expect(server.sysmon).toBeNull();
      expect((await server.app.inject({ url: '/api/recovery', headers })).json()).toMatchObject({ recovery: { mode: 'review', credentialsOmitted: true }, message: recoveryMessage });
      expect((await server.app.inject({ url: '/api/recovery/references', headers })).json()).toMatchObject({ pendingRuns: 2, retainedLocks: 1, contentVerified: false, executionEnabled: false });
      expect((await server.app.inject({ url: '/api/recovery/references', headers: { host: headers.host } })).statusCode).toBe(401);
      expect((await server.app.inject({ url: '/api/recovery/runs/queued/content', headers })).json()).toMatchObject({ status: 'not_recorded', executionEnabled: false });
      expect((await server.app.inject({ url: '/api/recovery/runs/queued/content', headers: { host: headers.host } })).statusCode).toBe(401);
      const queueReview = (await server.app.inject({ url: '/api/recovery/queue', headers })).json();
      expect(queueReview.jobs).toEqual([expect.objectContaining({ id: 'queued', eligible: true })]);
      expect((await server.app.inject({ method: 'POST', url: '/api/recovery/runs/queued/cancel-queued', headers: { host: headers.host }, payload: { digest: queueReview.jobs[0].digest, confirmation: 'CANCEL QUEUED JOB' } })).statusCode).toBe(401);
      expect((await server.app.inject({ method: 'POST', url: '/api/recovery/runs/queued/cancel-queued', headers, payload: { digest: 'stale', confirmation: 'CANCEL QUEUED JOB' } })).statusCode).toBe(409);
      expect((await server.app.inject({ method: 'POST', url: '/api/session', headers })).statusCode).toBe(200);
      for (const [method, url] of [['POST', '/api/dispatch'], ['POST', '/api/setup/probe'], ['POST', '/api/connections/figma'], ['DELETE', '/api/connections/figma'], ['POST', '/api/runs/running/reconcile'], ['POST', '/api/automations/missing/run']] as const) {
        expect((await server.app.inject({ method, url, headers, payload: method === 'POST' ? {} : undefined })).statusCode).toBe(423);
      }
      const view = (await server.app.inject({ url: '/api/runs', headers })).json().runs;
      expect(view.map((r: { id: string }) => r.id).sort()).toEqual(['queued', 'running']);
      await server.close(); server = undefined;
      const checked = openDb(env.dbPath);
      expect(checked.sqlite.prepare('SELECT * FROM runs ORDER BY id').all()).toEqual(originalRuns);
      expect(checked.sqlite.prepare('SELECT * FROM execution_locks').all()).toEqual(originalLocks);
      checked.sqlite.close(); expect(starts).toBe(0);
    }
    server = await buildServer(env, { startSystem: true, spawner: { spawn() { starts++; throw new Error('Restored job started'); } } });
    const review = (await server.app.inject({ url: '/api/recovery/queue', headers })).json().jobs[0];
    expect((await server.app.inject({ method: 'POST', url: '/api/recovery/runs/queued/cancel-queued', headers, payload: { digest: review.digest, confirmation: 'CANCEL QUEUED JOB' } })).json()).toMatchObject({ cancelled: true, locksReleased: false });
    await server.close(); server = undefined;
    const afterCancel = openDb(env.dbPath);
    expect(afterCancel.sqlite.prepare("SELECT status FROM runs WHERE id='queued'").get()).toEqual({ status: 'failed' });
    expect(afterCancel.sqlite.prepare("SELECT * FROM runs WHERE id='running'").get()).toEqual(originalRuns.find((row) => (row as { id: string }).id === 'running'));
    expect(afterCancel.sqlite.prepare('SELECT * FROM execution_locks').all()).toEqual(originalLocks); afterCancel.sqlite.close();
    expect(starts).toBe(0);
    const marker = readFileSync(join(restored, 'restore-state.json'), 'utf8');
    writeFileSync(join(restored, 'restore-state.json'), '{"version":1,"mode":"restoring"}');
    await expect(buildServer(env, { startSystem: false })).rejects.toThrow('Incomplete or invalid restoration');
    writeFileSync(join(restored, 'restore-state.json'), marker);
  } finally { await server?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
