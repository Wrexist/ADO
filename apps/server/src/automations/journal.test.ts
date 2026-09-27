import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openDb } from '../db';
import { automationDispatches, events, runs } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from '../runner';
import { AutomationStore } from './store';
import { AutomationJournal } from './journal';
import { AutomationEngine } from './engine';
import { buildServer } from '../app';
import { backupDatabase, restoreBackup } from '../backup';

const input = { repoId: 'fixture', name: 'Fixture', task: 'Offline only', enabled: true, trigger: { on: 'manual' as const } };
const spawner = { spawn() { throw new Error('No agent may start'); } };

it('repairs accepted history on normal server boot and preserves pending receipts in a restored review profile', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-boot-')), database = join(root, 'profile.sqlite');
  const opened = openDb(database), store = new AutomationStore(join(root, 'automations.json')), a = store.upsert(input);
  const runner = new Runner(new Bus(opened.db), opened.db, spawner, { cwdFor: () => root, maxConcurrent: 0 });
  const { runId } = runner.dispatch({ repoId: 'fixture', task: input.task, automationId: a.id });
  await runner.stop();
  const backup = backupDatabase(opened.sqlite, join(root, 'backups'), { dataDir: root }); opened.sqlite.close();
  const restored = join(root, 'restored'); restoreBackup(backup.file, restored);
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'fixture' };
  try {
    for (const recovery of [true, false]) {
      const path = recovery ? join(restored, 'acc.sqlite') : database;
      const spawn = vi.fn(() => { throw new Error('must not spawn'); });
      const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture', dbPath: path, projectDirs: [], demo: false }, { startSystem: false, startScanner: false, spawner: { spawn } });
      try {
        const response = await server.app.inject({ url: '/api/automations', headers });
        expect(response.statusCode).toBe(200);
        expect(response.json().automations[0].lastRunId).toBe(recovery ? null : runId);
        if (recovery) {
          const review = await server.app.inject({ method: 'POST', url: '/api/recovery/prepare', headers });
          expect(review.json().blockers.join('\n')).toContain('unresolved history receipts');
        }
        expect(spawn).not.toHaveBeenCalled();
      } finally { await server.close(); }
      const check = openDb(path);
      try { expect(new AutomationJournal(check.db).pending()).toHaveLength(recovery ? 1 : 0); expect(check.db.select().from(runs).all()).toHaveLength(1); }
      finally { check.sqlite.close(); }
    }
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('rolls back run, receipt and event together, and reuses an unrecorded receipt after a post-commit exception', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-transaction-'));
  const { db, sqlite } = openDb(join(root, 'profile.sqlite'));
  const runner = new Runner(new Bus(db), db, spawner, { cwdFor: () => root, maxConcurrent: 0 });
  try {
    sqlite.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON automation_dispatches BEGIN SELECT RAISE(ABORT, 'receipt denied'); END");
    expect(() => runner.dispatch({ repoId: 'fixture', task: 'Offline only', automationId: 'recipe' })).toThrow('receipt denied');
    expect(db.select().from(runs).all()).toEqual([]); expect(db.select().from(events).all()).toEqual([]);
    expect(db.select().from(automationDispatches).all()).toEqual([]);
    sqlite.exec('DROP TRIGGER reject_receipt');
    const store = new AutomationStore(join(root, 'automations.json')), a = store.upsert(input), journal = new AutomationJournal(db);
    const dispatch = vi.fn((repoId: string, task: string, model?: string, automationId?: string) => {
      runner.dispatch({ repoId, task, model, automationId }); throw new Error('post-commit interruption');
    });
    const engine = new AutomationEngine(store, dispatch, undefined, undefined, undefined, journal);
    const result = engine.runNow(a.id);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(store.get(a.id)?.lastRunId).toBe(result.runId);
    expect(db.select().from(runs).all()).toHaveLength(1); expect(journal.pending()).toEqual([]);
  } finally { await runner.stop(); sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('keeps the accepted receipt when history repair fails, and repairs it after reopening without dispatch', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-repair-')), file = join(root, 'automations.json'), database = join(root, 'profile.sqlite');
  let opened = openDb(database);
  const runner = new Runner(new Bus(opened.db), opened.db, spawner, { cwdFor: () => root, maxConcurrent: 0 });
  try {
    const store = new AutomationStore(file), a = store.upsert(input), journal = new AutomationJournal(opened.db);
    const save = vi.spyOn(store, 'markRun').mockImplementation(() => { throw new Error('disk unavailable'); });
    const engine = new AutomationEngine(store, (repoId, task, model, automationId) => runner.dispatch({ repoId, task, model, automationId }), undefined, undefined, undefined, journal);
    expect(() => engine.runNow(a.id)).toThrow('could not save');
    const pending = journal.pending()[0]; expect(pending).toBeTruthy();
    const same = runner.dispatch({ repoId: 'fixture', task: 'changed recipe must not dispatch', automationId: a.id });
    expect(same.runId).toBe(pending.runId); expect(opened.db.select().from(runs).all()).toHaveLength(1);
    engine.reconcile(); expect(journal.pending()).toHaveLength(1);
    save.mockRestore(); await runner.stop(); opened.sqlite.close(); opened = openDb(database);
    const reopened = new AutomationStore(file), replay = new AutomationJournal(opened.db), dispatch = vi.fn(() => { throw new Error('must not dispatch'); });
    const recovered = new AutomationEngine(reopened, dispatch, undefined, undefined, undefined, replay);
    recovered.reconcile();
    expect(reopened.get(a.id)).toMatchObject({ lastRunId: pending.runId, lastRunTs: pending.acceptedTs });
    expect(replay.pending()).toEqual([]); expect(dispatch).not.toHaveBeenCalled();
    const bytes = readFileSync(file); recovered.reconcile(); expect(readFileSync(file)).toEqual(bytes);
    expect(opened.db.select().from(runs).all()).toHaveLength(1);
  } finally { await runner.stop(); opened.sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it.each(['before-commit', 'after-commit', 'after-history', 'after-complete'])('recovers after actual child-process exit at %s without another dispatch', (point) => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-automation-crash-')), database = join(root, 'profile.sqlite'), file = join(root, 'automations.json');
  const moduleUrl = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);
  const code = `
    import { openDb } from ${moduleUrl('../db/index.ts')};
    import { Bus } from ${moduleUrl('../bus.ts')};
    import { Runner } from ${moduleUrl('../runner/index.ts')};
    import { AutomationStore } from ${moduleUrl('./store.ts')};
    import { AutomationEngine } from ${moduleUrl('./engine.ts')};
    import { AutomationJournal } from ${moduleUrl('./journal.ts')};
    const { db, sqlite } = openDb(${JSON.stringify(database)});
    const store = new AutomationStore(${JSON.stringify(file)}), a = store.upsert(${JSON.stringify(input)});
    const bus = new Bus(db), journal = new AutomationJournal(db);
    if (${JSON.stringify(point)} === 'before-commit') {
      sqlite.function('fixture_crash', () => process.exit(73));
      sqlite.exec('CREATE TRIGGER crash_before_event BEFORE INSERT ON events BEGIN SELECT fixture_crash(); END');
    }
    if (${JSON.stringify(point)} === 'after-commit') bus.subscribe(() => process.exit(73));
    if (${JSON.stringify(point)} === 'after-history') journal.complete = () => process.exit(73);
    const runner = new Runner(bus, db, { spawn() { throw new Error('must not spawn'); } }, { cwdFor: () => ${JSON.stringify(root)}, maxConcurrent: 0 });
    const engine = new AutomationEngine(store, (repoId, task, model, automationId) => runner.dispatch({ repoId, task, model, automationId }), undefined, undefined, undefined, journal);
    engine.runNow(a.id); process.exit(73);
  `;
  try {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { windowsHide: true, timeout: 30000, encoding: 'utf8' });
    expect(child.error, child.stderr).toBeUndefined(); expect(child.status, child.stderr).toBe(73);
    const { db, sqlite } = openDb(database);
    try {
      const count = point === 'before-commit' ? 0 : 1;
      expect(db.select().from(runs).all()).toHaveLength(count); expect(db.select().from(automationDispatches).all()).toHaveLength(count);
      const store = new AutomationStore(file), journal = new AutomationJournal(db), dispatch = vi.fn(() => { throw new Error('must not dispatch'); });
      new AutomationEngine(store, dispatch, undefined, undefined, undefined, journal).reconcile();
      expect(dispatch).not.toHaveBeenCalled(); expect(journal.pending()).toEqual([]);
      expect(store.list()[0].lastRunId).toBe(count ? db.select().from(runs).get()!.id : null);
      expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok'); expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally { sqlite.close(); }
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 40000);
