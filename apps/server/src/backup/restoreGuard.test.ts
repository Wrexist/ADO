import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { backupDatabase, restoreBackup } from './index';
import { readRecoveryState } from './recovery';
import { readRestoreGuard, restoreStagingFile } from './restoreGuard';
import { openDb } from '../db';
import { runs, executionLocks } from '../db/schema';
import { buildServer } from '../app';

it('refuses missing, exchanged and downgraded restore markers before old jobs or locks can change', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-restore-binding-'));
  try {
    const source = openDb(join(root, 'source.sqlite'));
    source.db.insert(runs).values({ id: 'old', repoId: 'fixture', task: 'Keep paused', model: 'default', status: 'queued', engineVersion: 1, startedTs: new Date().toISOString() }).run();
    source.db.insert(executionLocks).values({ resource: 'fixture', runId: 'old', owner: 'uncertain', acquiredTs: new Date().toISOString() }).run();
    const backup = backupDatabase(source.sqlite, join(root, 'backups'), { dataDir: root }); source.sqlite.close();
    const first = join(root, 'first'), other = join(root, 'other'); restoreBackup(backup.file, first); restoreBackup(backup.file, other);
    const database = join(first, 'custom.sqlite'); renameSync(join(first, 'acc.sqlite'), database);
    const marker = join(first, 'restore-state.json'), original = readFileSync(marker, 'utf8');
    expect(readRecoveryState(first, database)?.mode).toBe('review');
    const bytes = readFileSync(database);
    const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture', dbPath: database, projectDirs: [root], demo: false };
    let starts = 0;
    const boot = () => buildServer(env, { startSystem: true, startScanner: true, spawner: { spawn() { starts++; throw new Error('Must not start'); } } });
    renameSync(marker, join(first, 'held.json'));
    await expect(boot()).rejects.toThrow('Cannot read recovery state');
    writeFileSync(marker, readFileSync(join(other, 'restore-state.json')));
    await expect(boot()).rejects.toThrow('does not match');
    const downgraded = JSON.parse(original); downgraded.version = 1; delete downgraded.restoreId;
    writeFileSync(marker, JSON.stringify(downgraded)); await expect(boot()).rejects.toThrow('does not match');
    expect(readFileSync(database)).toEqual(bytes); expect(starts).toBe(0);
    writeFileSync(marker, original);
    const server = await boot(); expect(server.scanner).toBeNull(); expect(server.sysmon).toBeNull(); await server.close();
    const restored = openDb(database);
    expect(restored.db.select().from(runs).get()?.status).toBe('queued'); expect(restored.db.select().from(executionLocks).all()).toHaveLength(1);
    const secondBackup = backupDatabase(restored.sqlite, join(root, 'second-backup'), { dataDir: first }); restored.sqlite.close();
    const second = join(root, 'second'); restoreBackup(secondBackup.file, second);
    expect(readRestoreGuard(join(second, 'acc.sqlite'))?.restoreId).not.toBe(readRestoreGuard(database)?.restoreId);
    expect(readRecoveryState(second)?.mode).toBe('review');
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('enrols a present legacy marker and rejects later marker loss without rewriting history', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-legacy-binding-'));
  try {
    const database = join(root, 'acc.sqlite'), marker = join(root, 'restore-state.json');
    const source = openDb(database); source.sqlite.close();
    writeFileSync(marker, JSON.stringify({ version: 1, mode: 'manual', databaseSha256: 'a'.repeat(64), restoredAt: '2026-09-27', activation: { approvedAt: '2026-09-27', digest: 'b'.repeat(64) } }));
    expect(readRecoveryState(root)?.mode).toBe('manual');
    expect(JSON.parse(readFileSync(marker, 'utf8'))).toMatchObject({ version: 2, mode: 'manual', restoreId: readRestoreGuard(database)?.restoreId });
    const bytes = readFileSync(database); expect(readRecoveryState(root)?.mode).toBe('manual'); expect(readFileSync(database)).toEqual(bytes);
    renameSync(marker, join(root, 'held.json')); expect(() => readRecoveryState(root)).toThrow('Cannot read recovery state');
    expect(readFileSync(database)).toEqual(bytes);
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

it('refuses incomplete staging even without its marker and does not create a normal database', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-staging-binding-'));
  try {
    const source = openDb(join(root, 'source.sqlite')); source.sqlite.close();
    copyFileSync(join(root, 'source.sqlite'), join(root, restoreStagingFile));
    expect(() => readRecoveryState(root)).toThrow('Incomplete restoration staging');
    expect(readRestoreGuard(join(root, 'acc.sqlite'))).toBeNull();
  } finally { rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
