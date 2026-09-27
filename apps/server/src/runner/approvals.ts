import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { approvalPolicies, approvalPolicyVersions, operationApprovals } from '../db/schema';

export const LOCAL_OWNER = 'local-owner';
export interface AcceptanceBinding {
  operation: 'result.accept'; runId: string; repoId: string; headSha: string; diffDigest: string;
  workspacePath: string; baseSha: string; verificationId: string; priorHumanAction: string | null;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const payload = (binding: AcceptanceBinding) => JSON.stringify({
  operation: binding.operation, runId: binding.runId, repoId: binding.repoId,
  headSha: binding.headSha, diffDigest: binding.diffDigest, workspacePath: binding.workspacePath,
  baseSha: binding.baseSha, verificationId: binding.verificationId, priorHumanAction: binding.priorHumanAction,
});
const pending = and(isNull(operationApprovals.consumedTs), isNull(operationApprovals.revokedTs));

/** No bearer permission: authenticated local owner must explicitly consume a
 * matching prepared review, atomically with the local result decision. */
export class ApprovalStore {
  constructor(private db: Db, private policy: (repoId: string) => string = () => 'trusted-local-result-accept-v1', private now = () => Date.now()) {}

  policyVersion(repoId: string): string {
    const snapshotJson = this.policy(repoId);
    const policyDigest = digest(snapshotJson);
    return this.db.transaction(() => {
      const previous = this.db.select().from(approvalPolicies).where(eq(approvalPolicies.repoId, repoId)).get();
      if (previous?.digest === policyDigest) {
        const saved = this.db.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.version, previous.version)).get();
        if (!saved || saved.repoId !== repoId || saved.digest !== policyDigest || digest(saved.snapshotJson) !== policyDigest) throw new Error('Stored approval policy is invalid');
        return previous.version;
      }
      const version = randomUUID();
      this.db.insert(approvalPolicyVersions).values({ version, repoId, digest: policyDigest, snapshotJson, createdTs: new Date(this.now()).toISOString() }).run();
      this.db.update(operationApprovals).set({ revokedTs: new Date(this.now()).toISOString(), revokeReason: 'Project policy changed' })
        .where(and(eq(operationApprovals.repoId, repoId), pending)).run();
      this.db.insert(approvalPolicies).values({ repoId, version, digest: policyDigest })
        .onConflictDoUpdate({ target: approvalPolicies.repoId, set: { version, digest: policyDigest } }).run();
      return version;
    });
  }

  prepare(binding: AcceptanceBinding, policyVersion: string, actorId = LOCAL_OWNER) {
    if (binding.operation !== 'result.accept') throw new Error('Unsupported approval operation');
    if (policyVersion !== this.policyVersion(binding.repoId)) throw new Error('Project policy changed; reload and review again');
    const payloadJson = payload(binding);
    const time = this.now();
    const row = { id: randomUUID(), actorId, operation: binding.operation, runId: binding.runId, repoId: binding.repoId,
      headSha: binding.headSha, diffDigest: binding.diffDigest, payloadJson, payloadHash: digest(payloadJson), policyVersion,
      issuedTs: new Date(time).toISOString(), expiresTs: new Date(time + 5 * 60_000).toISOString(),
      consumedTs: null, revokedTs: null, revokeReason: null };
    this.db.insert(operationApprovals).values(row).run();
    return this.publicRow(row);
  }

  consume<T>(id: string, binding: AcceptanceBinding, policyVersion: string, effect: () => T, actorId = LOCAL_OWNER): T {
    // Persist a discovered policy change even if the subsequent decision fails.
    const currentPolicy = this.policyVersion(binding.repoId);
    return this.db.transaction(() => {
      const row = this.db.select().from(operationApprovals).where(eq(operationApprovals.id, id)).get();
      if (!row || row.consumedTs || row.revokedTs) throw new Error('Review is missing, revoked or already consumed; prepare a new review');
      if (row.actorId !== actorId || row.operation !== binding.operation || row.runId !== binding.runId || row.repoId !== binding.repoId || row.headSha !== binding.headSha || row.diffDigest !== binding.diffDigest || row.payloadHash !== digest(payload(binding)) || row.payloadHash !== digest(row.payloadJson)) throw new Error('Review belongs to a different operation or result');
      const persistedPolicy = this.db.select().from(approvalPolicies).where(eq(approvalPolicies.repoId, binding.repoId)).get();
      if (row.policyVersion !== currentPolicy || policyVersion !== currentPolicy || persistedPolicy?.version !== currentPolicy) throw new Error('Project policy changed; reload and review again');
      const time = this.now();
      const issued = Date.parse(row.issuedTs), expires = Date.parse(row.expiresTs);
      if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > 300000 || time < issued || time >= expires) throw new Error('Review expired or invalid; prepare a new review');
      const consumed = this.db.update(operationApprovals).set({ consumedTs: new Date(time).toISOString() })
        .where(and(eq(operationApprovals.id, id), pending)).run();
      if (consumed.changes !== 1) throw new Error('Review was already consumed');
      const result = effect();
      if (result instanceof Promise) throw new Error('Approval effects must commit synchronously');
      return result;
    });
  }

  invalidateRun(runId: string, reason: string) {
    this.db.update(operationApprovals).set({ revokedTs: new Date(this.now()).toISOString(), revokeReason: reason })
      .where(and(eq(operationApprovals.runId, runId), pending)).run();
  }

  invalidatePolicy(repoId: string) {
    this.db.transaction(() => {
      this.db.update(operationApprovals).set({ revokedTs: new Date(this.now()).toISOString(), revokeReason: 'Project policy change requested' })
        .where(and(eq(operationApprovals.repoId, repoId), pending)).run();
      this.db.delete(approvalPolicies).where(eq(approvalPolicies.repoId, repoId)).run();
    });
  }

  history(runId: string) {
    return this.db.select().from(operationApprovals).where(eq(operationApprovals.runId, runId))
      .orderBy(desc(operationApprovals.issuedTs), desc(operationApprovals.id)).limit(20).all().map((row) => this.publicRow(row));
  }

  private publicRow(row: typeof operationApprovals.$inferSelect) {
    const { payloadJson: _payload, ...publicRow } = row;
    void _payload;
    const policy = this.db.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.version, row.policyVersion)).get();
    if (!policy || digest(policy.snapshotJson) !== policy.digest || policy.repoId !== row.repoId) throw new Error('Stored review policy is missing or invalid');
    return { ...publicRow, policySnapshot: policy.snapshotJson };
  }
}
