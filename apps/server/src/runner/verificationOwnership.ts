import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { executionLocks, portfolioCheckouts, runs, verificationAttempts } from '../db/schema';
import { commonGitIdentity } from '../projects/checkoutIdentity';
import type { ProcessIdentity } from '../lib/ownedProcess';
import { readTerminationReceipt } from '../lib/terminationReceipt';
import { executionCapacityAvailable, executionCapacityReason } from './executionCapacity';

export const verificationOwner = (id: string) => `verify:${id}`;

/** Also used before agent claim, including repositories not yet in the registry. */
export function verificationBlocks(db: Db, repoId: string, cwd: string, resource?: string) {
  const locks = db.select().from(executionLocks).all().filter((lock) => lock.owner.startsWith('verify:'));
  if (!locks.length) return false;
  const checkout = db.select().from(portfolioCheckouts).all().find((c) => c.sourceId === repoId);
  let identity: string;
  try { identity = commonGitIdentity(cwd); } catch { return true; }
  return locks.some((lock) => {
    const attempt = db.select().from(verificationAttempts).where(eq(verificationAttempts.id, lock.owner.slice(7))).get();
    const source = db.select().from(runs).where(eq(runs.id, lock.runId)).get()?.sourceGitIdentity;
    return !attempt || lock.resource === resource || attempt.repoId === repoId || attempt.gitIdentity === identity || source === identity || Boolean(checkout && attempt.repositoryId === checkout.repositoryId);
  });
}

export class VerificationOwnership {
  constructor(private db: Db, private receiptRoot?: string, private cwdFor?: (repoId: string) => string | undefined, private resourceFor?: (repoId: string, cwd: string) => string) {}

  busy(runId: string) { return Boolean(this.db.select().from(executionLocks).where(eq(executionLocks.runId, runId)).get()); }

  /** Called inside the same transaction that invalidates prior proof. */
  claim(run: typeof runs.$inferSelect) {
    if (!executionCapacityAvailable(this.db)) throw new Error(executionCapacityReason);
    const gitIdentity = commonGitIdentity(run.workspacePath!);
    const sourceIdentity = run.sourceGitIdentity ?? gitIdentity;
    const resource = this.resourceFor?.(run.repoId, run.workspacePath!);
    const checkouts = this.db.select().from(portfolioCheckouts).all();
    const checkout = checkouts.find((c) => c.sourceId === run.repoId || c.gitIdentity === sourceIdentity);
    for (const lock of this.db.select().from(executionLocks).all()) {
      const owner = this.db.select().from(runs).where(eq(runs.id, lock.runId)).get();
      if (!owner || owner.repoId === run.repoId || lock.resource === resource) throw new Error('Repository has an active or quarantined writer');
      const registered = checkouts.find((c) => c.sourceId === owner.repoId);
      if (checkout && registered?.repositoryId === checkout.repositoryId) throw new Error('Repository has an active or quarantined writer');
      if (owner.sourceGitIdentity) {
        if (owner.sourceGitIdentity === sourceIdentity) throw new Error('Repository has an active or quarantined writer');
      }
      const path = owner.workspacePath ?? registered?.canonicalPath ?? this.cwdFor?.(owner.repoId) ?? (isAbsolute(lock.resource) ? lock.resource : undefined);
      let otherIdentity: string | undefined;
      try { if (path) otherIdentity = commonGitIdentity(path); } catch { /* unknown is not permission */ }
      if (!otherIdentity || otherIdentity === sourceIdentity || otherIdentity === gitIdentity) throw new Error('Repository has an active or quarantined writer');
    }
    const id = randomUUID(), startedTs = new Date().toISOString();
    this.db.insert(verificationAttempts).values({ id, runId: run.id, repoId: run.repoId, repositoryId: checkout?.repositoryId, gitIdentity, workspacePath: run.workspacePath!, baseSha: run.baseSha!, headSha: run.headSha!, diffDigest: run.diffDigest!, command: 'npm run verify', status: 'running', startedTs }).run();
    this.db.insert(executionLocks).values({ resource: resource ?? verificationOwner(id), runId: run.id, owner: verificationOwner(id), acquiredTs: startedTs }).run();
    return id;
  }

  identify(id: string, identity: ProcessIdentity) {
    this.db.transaction(() => {
      this.assertRunning(id);
      const result = this.db.update(verificationAttempts).set({ processIdentity: JSON.stringify(identity), processTermination: 'unconfirmed' }).where(and(eq(verificationAttempts.id, id), eq(verificationAttempts.status, 'running'))).run();
      if (result.changes !== 1) throw new Error('Verification attempt is no longer running');
    });
  }

  assertRunning(id: string) {
    const attempt = this.db.select().from(verificationAttempts).where(eq(verificationAttempts.id, id)).get();
    const lock = this.db.select().from(executionLocks).where(eq(executionLocks.owner, verificationOwner(id))).get();
    if (!attempt || attempt.status !== 'running' || lock?.runId !== attempt.runId) throw new Error('Verification writer ownership was lost');
    if (commonGitIdentity(attempt.workspacePath) !== attempt.gitIdentity) throw new Error('Verification repository identity changed');
  }

  /** Caller must have observed termination, or know that spawning never began. */
  finish(id: string, status: string, termination: string, release: boolean, note?: string) {
    this.db.update(verificationAttempts).set({ status, processTermination: termination, endedTs: new Date().toISOString(), note }).where(eq(verificationAttempts.id, id)).run();
    if (release) this.db.delete(executionLocks).where(eq(executionLocks.owner, verificationOwner(id))).run();
  }

  reconcile(runId?: string) {
    return this.db.transaction(() => {
      let recovered = 0;
      for (const lock of this.db.select().from(executionLocks).all().filter((row) => row.owner.startsWith('verify:') && (!runId || row.runId === runId))) {
        const attempt = this.db.select().from(verificationAttempts).where(eq(verificationAttempts.id, lock.owner.slice(7))).get();
        if (!attempt) continue;
        const receipt = this.receiptRoot && readTerminationReceipt(this.receiptRoot, attempt.processIdentity);
        this.finish(attempt.id, 'interrupted', receipt ? 'confirmed' : 'unconfirmed', Boolean(receipt), receipt ? 'Owned processes stopped; interrupted verification was not retried and is not passing evidence' : 'Verification owner interrupted; writer remains quarantined');
        if (receipt) recovered++;
      }
      return recovered;
    });
  }
}
