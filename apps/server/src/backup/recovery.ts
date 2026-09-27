import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const recoveryMessage = 'Recovery review mode: jobs and changes are paused. Displayed activity is restored history, not proof of live processes. Review restored references and recover local work before enabling execution. Connection credentials must be entered again.';
export function readRecoveryState(directory: string) {
  let raw: string;
  try { raw = readFileSync(join(directory, 'restore-state.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('Cannot read recovery state; profile preserved'); }
  let state: { version?: number; mode?: string; databaseSha256?: string; restoredAt?: string };
  try { state = JSON.parse(raw) as typeof state; }
  catch { throw new Error('Invalid recovery state; profile preserved'); }
  if (state?.version !== 1 || state.mode !== 'review' || !/^[a-f0-9]{64}$/.test(state.databaseSha256 ?? '') || typeof state.restoredAt !== 'string') throw new Error('Incomplete or invalid restoration; preserve the profile and restore the backup into another new directory');
  return { mode: 'review' as const, restoredAt: state.restoredAt, credentialsOmitted: true as const };
}
