import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { RecoveryReference, RecoveryReferenceReport, RecoveryReferenceStatus } from '@ado/shared';
import type { Db } from '../db';
import { portfolioCheckouts, runs, verificationAttempts, executionLocks } from '../db/schema';
import { commonGitIdentity, directoryIdentity, pathKey } from '../projects/checkoutIdentity';

/** Observations only: no Git commands, migrations, repairs or lock reconciliation. */
export function inspectRecoveryReferences(db: Db, hostId: string): RecoveryReferenceReport {
  function inspect(path: string | null, gitIdentity: string | null, pathIdentity?: string): RecoveryReferenceStatus {
    if (!path || !isAbsolute(path)) return 'unrecorded';
    try {
      const actual = realpathSync(path);
      if (pathKey(actual) !== pathKey(path) || (pathIdentity && directoryIdentity(actual) !== pathIdentity)) return 'replaced';
      const git = commonGitIdentity(actual);
      if (!gitIdentity) return 'unrecorded';
      return git === gitIdentity ? 'identity_matches' : 'replaced';
    } catch (error) {
      return ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '') ? 'missing' : 'unavailable';
    }
  }
  const allRuns = db.select().from(runs).all();
  const attempts = db.select().from(verificationAttempts).all();
  const byId = new Map(allRuns.map((run) => [run.id, run]));
  const references: RecoveryReference[] = db.select().from(portfolioCheckouts).all().map((checkout) => ({
    kind: 'checkout', id: checkout.id, path: checkout.canonicalPath,
    status: checkout.hostId !== hostId ? 'other_host' : inspect(checkout.canonicalPath, checkout.gitIdentity, checkout.pathIdentity),
  }));
  for (const run of allRuns) if (run.workspacePath || (run.engineVersion >= 1 && run.status === 'done')) references.push({
    kind: 'run_workspace', id: run.id, path: run.workspacePath,
    status: inspect(run.workspacePath, run.workspaceGitIdentity),
  });
  for (const attempt of attempts) {
    const run = byId.get(attempt.runId);
    const identity = run?.workspacePath && pathKey(run.workspacePath) === pathKey(attempt.workspacePath) ? run.workspaceGitIdentity : null;
    references.push({ kind: 'verification_workspace', id: attempt.id, path: attempt.workspacePath, status: inspect(attempt.workspacePath, identity) });
  }
  return {
    checkedAt: new Date().toISOString(), references,
    pendingRuns: allRuns.filter((run) => ['queued', 'running'].includes(run.status)).length,
    pendingVerifications: attempts.filter((attempt) => attempt.status === 'running').length,
    retainedLocks: db.select().from(executionLocks).all().length,
    contentVerified: false, executionEnabled: false,
  };
}
