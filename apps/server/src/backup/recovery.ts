import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readRestoreGuard, restoreStagingFile, writeRestoreGuard } from './restoreGuard';
import { ConnectionFile } from '../connections/file';

export const recoveryMessage = 'Recovery review mode: jobs and changes are paused. Displayed activity is restored history, not proof of live processes. Review restored references and recover local work before enabling execution. Connection credentials must be entered again.';
export function readRecoveryState(directory: string, database = join(directory, 'acc.sqlite')) {
  if (existsSync(join(directory, restoreStagingFile))) throw new Error('Incomplete restoration staging database; preserve this profile and restore into another new directory');
  const guard = readRestoreGuard(database);
  let raw: string;
  try { raw = readFileSync(join(directory, 'restore-state.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !guard) return null; throw new Error('Cannot read recovery state; profile preserved'); }
  let state: { version?: number; restoreId?: string; mode?: string; databaseSha256?: string; restoredAt?: string; activation?: { approvedAt?: string; digest?: string } };
  try { state = JSON.parse(raw) as typeof state; }
  catch { throw new Error('Invalid recovery state; profile preserved'); }
  if (![1, 2].includes(state?.version ?? 0) || !['review', 'manual'].includes(state.mode ?? '') || !/^[a-f0-9]{64}$/.test(state.databaseSha256 ?? '') || typeof state.restoredAt !== 'string' || (state.mode === 'manual' && (!state.activation?.approvedAt || !/^[a-f0-9]{64}$/.test(state.activation.digest ?? '')))) throw new Error('Incomplete or invalid restoration; preserve the profile and restore the backup into another new directory');
  if (state.version === 1 && !guard) {
    // Enrol a still-present legacy marker before allowing startup. A crash between the
    // two writes leaves a mismatching marker and therefore fails closed on next boot.
    const file = new ConnectionFile(join(directory, 'restore-state.json')); const original = file.read();
    if (JSON.stringify(original) !== JSON.stringify(state)) throw new Error('Recovery state changed; profile preserved');
    const next = { restoreId: randomUUID(), databaseSha256: state.databaseSha256!, restoredAt: state.restoredAt! };
    writeRestoreGuard(database, next);
    file.write({ ...state, ...next, version: 2 });
  } else if (!guard || state.version !== 2 || state.restoreId !== guard.restoreId || state.databaseSha256 !== guard.databaseSha256 || state.restoredAt !== guard.restoredAt) {
    throw new Error('Recovery marker does not match its database; preserve the profile and restore into another new directory');
  }
  return { mode: state.mode as 'review' | 'manual', restoredAt: state.restoredAt, credentialsOmitted: true as const };
}
