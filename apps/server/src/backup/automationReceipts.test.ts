import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { automationDispatches, events, executionLocks, runs } from '../db/schema';
import { AutomationStore } from '../automations/store';
import { RecoveryAutomationReceipts } from './automationReceipts';
import { backupDatabase, restoreBackup } from './index';
import { buildServer } from '../app';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'controlos-receipt-review-')), file = join(root, 'automations.json');
  const { db, sqlite } = openDb(join(root, 'source.sqlite'));
  const store = new AutomationStore(file), a = store.upsert({ name: 'Preserved recipe', repoId: 'fixture', task: 'Original task', enabled: false, trigger: { on: 'manual' } });
  const acceptedTs = '2026-09-27T12:00:00.000Z';
  for (const [id, automationId] of [['existing', a.id], ['missing', 'missing-definition']]) {
    db.insert(runs).values({ id, repoId: 'fixture', task: 'Accepted old task', model: 'default', status: 'queued', startedTs: acceptedTs, engineVersion: 1 }).run();
    db.insert(automationDispatches).values({ runId: id, automationId, acceptedTs }).run();
  }
  db.insert(executionLocks).values({ resource: 'fixture', runId: 'existing', owner: 'uncertain', acquiredTs: acceptedTs }).run();
  return { root, file, db, sqlite, store, a, acceptedTs, review: new RecoveryAutomationReceipts(db, new Bus(db), store) };
}

it('binds review to current content, preserves jobs/locks, and retries a partial history projection without duplicate audit', () => {
  const h = fixture();
  try {
    let review = h.review.review('existing');
    expect(() => h.review.resolve('existing', review.digest, 'yes')).toThrow('Type RECORD');
    h.db.update(runs).set({ note: 'changed since review' }).where(eq(runs.id, 'existing')).run();
    expect(() => h.review.resolve('existing', review.digest, 'RECORD AUTOMATION HISTORY')).toThrow('changed');
    review = h.review.review('existing');
    const runRows = h.db.select().from(runs).all(), locks = h.db.select().from(executionLocks).all();
    h.sqlite.exec("CREATE TRIGGER reject_receipt_audit BEFORE INSERT ON events WHEN NEW.id LIKE 'recovery-automation:%' BEGIN SELECT RAISE(ABORT, 'audit denied'); END");
    expect(() => h.review.resolve('existing', review.digest, 'RECORD AUTOMATION HISTORY')).toThrow('receipt remains pending');
    expect(h.store.get(h.a.id)?.lastRunId).toBe('existing');
    expect(new AutomationStore(h.file).get(h.a.id)?.lastRunId).toBe('existing');
    expect(h.db.select().from(automationDispatches).where(eq(automationDispatches.runId, 'existing')).get()?.recordedTs).toBeNull();
    expect(h.db.select().from(events).all()).toEqual([]);
    h.sqlite.exec('DROP TRIGGER reject_receipt_audit');
    expect(() => h.review.resolve('existing', review.digest, 'RECORD AUTOMATION HISTORY')).toThrow('changed');
    review = h.review.review('existing'); const bytes = readFileSync(h.file);
    expect(h.review.resolve('existing', review.digest, 'RECORD AUTOMATION HISTORY')).toMatchObject({ reviewed: true, historyProjected: true, executionEnabled: false, locksReleased: false });
    expect(readFileSync(h.file)).toEqual(bytes);
    expect(() => h.review.resolve('existing', review.digest, 'RECORD AUTOMATION HISTORY')).toThrow('not found');
    const missing = h.review.review('missing');
    expect(() => h.review.resolve('missing', missing.digest, 'RECORD AUTOMATION HISTORY')).toThrow('ACKNOWLEDGE MISSING');
    expect(h.review.resolve('missing', missing.digest, 'ACKNOWLEDGE MISSING AUTOMATION').historyProjected).toBe(false);
    expect(h.store.get('missing-definition')).toBeUndefined(); expect(readFileSync(h.file)).toEqual(bytes);
    expect(h.db.select().from(events).all()).toHaveLength(2);
    expect(h.db.select().from(runs).all()).toEqual(runRows); expect(h.db.select().from(executionLocks).all()).toEqual(locks);
  } finally { h.sqlite.close(); rmSync(h.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('rejects newer history and externally changed automation files without overwriting either', () => {
  const h = fixture();
  try {
    h.store.markRun(h.a.id, 'newer-run', '2026-09-28T12:00:00.000Z');
    const review = h.review.review('existing'); expect(review.eligible).toBe(false);
    expect(() => h.review.resolve('existing', review.digest, 'RECORD AUTOMATION HISTORY')).toThrow('newer or ambiguous');
    writeFileSync(h.file, '{externally changed');
    expect(() => h.review.list()).toThrow('changed or are unreadable');
    expect(() => h.review.resolve('missing', 'stale', 'ACKNOWLEDGE MISSING AUTOMATION')).toThrow('changed or are unreadable');
    expect(readFileSync(h.file, 'utf8')).toBe('{externally changed');
    expect(h.db.select().from(automationDispatches).all().every(row => row.recordedTs === null)).toBe(true);
  } finally { h.sqlite.close(); rmSync(h.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('requires authentication and restored review mode, and leaves other activation blockers after history review', async () => {
  const h = fixture(), restored = join(h.root, 'restored');
  const backup = backupDatabase(h.sqlite, join(h.root, 'backups'), { dataDir: h.root }); h.sqlite.close();
  restoreBackup(backup.file, restored);
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'fixture' };
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture', projectDirs: [], demo: false };
  let starts = 0;
  try {
    for (const recovery of [true, false]) {
      const server = await buildServer({ ...env, dbPath: recovery ? join(restored, 'acc.sqlite') : join(h.root, 'normal.sqlite') }, { startSystem: false, startScanner: false, spawner: { spawn() { starts++; throw new Error('must not start'); } } });
      try {
        const url = '/api/recovery/automation-receipts';
        expect((await server.app.inject({ url, headers: { host: headers.host } })).statusCode).toBe(401);
        const loaded = await server.app.inject({ url, headers }); expect(loaded.statusCode).toBe(recovery ? 200 : 409);
        const action = '/api/recovery/runs/existing/review-automation';
        expect((await server.app.inject({ method: 'POST', url: action, headers: { host: headers.host }, payload: {} })).statusCode).toBe(401);
        if (recovery) {
          for (const receipt of loaded.json().receipts) {
            const response = await server.app.inject({ method: 'POST', url: `/api/recovery/runs/${receipt.runId}/review-automation`, headers, payload: { digest: receipt.digest, confirmation: receipt.definitionPresent ? 'RECORD AUTOMATION HISTORY' : 'ACKNOWLEDGE MISSING AUTOMATION' } });
            // Projecting one history changes the content-bound digest of the other receipt.
            if (response.statusCode === 409) {
              const fresh = (await server.app.inject({ url, headers })).json().receipts.find((r: { runId: string }) => r.runId === receipt.runId);
              expect((await server.app.inject({ method: 'POST', url: `/api/recovery/runs/${receipt.runId}/review-automation`, headers, payload: { digest: fresh.digest, confirmation: 'ACKNOWLEDGE MISSING AUTOMATION' } })).statusCode).toBe(200);
            } else expect(response.statusCode).toBe(200);
          }
          expect((await server.app.inject({ url, headers })).json().receipts).toEqual([]);
          const review = (await server.app.inject({ method: 'POST', url: '/api/recovery/prepare', headers })).json();
          expect(review.blockers.join('\n')).toContain('writer locks'); expect(review.blockers.join('\n')).not.toContain('unresolved history receipts');
        } else expect((await server.app.inject({ method: 'POST', url: action, headers, payload: {} })).statusCode).toBe(409);
      } finally { await server.close(); }
    }
    expect(starts).toBe(0);
  } finally { rmSync(h.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
