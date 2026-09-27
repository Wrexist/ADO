import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { openDb } from '../db';
import { backupDatabase, restoreBackup } from './index';
import { readRecoveryState } from './recovery';
import { restoreStagingFile } from './restoreGuard';

const fault = vi.hoisted(() => ({ corruptCopy: false }));
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, copyFileSync: (...args: Parameters<typeof fs.copyFileSync>) => {
    fs.copyFileSync(...args);
    if (fault.corruptCopy) fs.writeFileSync(args[1], 'injected copy corruption');
  } };
});

it('checks copied bytes before exposing a restored database, preserving the source on copy corruption', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-copy-integrity-'));
  try {
    const source = openDb(join(root, 'source.sqlite'));
    const backup = backupDatabase(source.sqlite, join(root, 'backups'), { dataDir: root }); source.sqlite.close();
    const bytes = readFileSync(backup.file), destination = join(root, 'restored');
    fault.corruptCopy = true;
    expect(() => restoreBackup(backup.file, destination)).toThrow('Restored database checksum mismatch');
    expect(readFileSync(backup.file)).toEqual(bytes);
    expect(existsSync(join(destination, 'acc.sqlite'))).toBe(false);
    expect(existsSync(join(destination, restoreStagingFile))).toBe(true);
    expect(() => readRecoveryState(destination)).toThrow('Incomplete restoration staging');
  } finally { fault.corruptCopy = false; rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
