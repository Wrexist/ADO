import { createHash } from 'node:crypto';
import { eq, isNull } from 'drizzle-orm';
import type { RecoveryAutomationReceipt } from '@ado/shared';
import type { Db } from '../db';
import type { Bus } from '../bus';
import type { AutomationStore } from '../automations/store';
import { automationDispatches, executionLocks, runs } from '../db/schema';

export class RecoveryAutomationReceipts {
  constructor(private db: Db, private bus: Bus, private store: AutomationStore) {}
  review(id: string): RecoveryAutomationReceipt {
    const receipt = this.db.select().from(automationDispatches).where(eq(automationDispatches.runId, id)).get();
    const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!receipt || receipt.recordedTs || !run) throw new Error('Pending automation receipt not found');
    const definition = this.store.get(receipt.automationId);
    const locks = this.db.select().from(executionLocks).where(eq(executionLocks.runId, id)).all();
    const fileDigest = this.store.recoveryDigest();
    const digest = createHash('sha256').update(JSON.stringify({ receipt, run, definition, locks, fileDigest })).digest('hex');
    const oldTime = definition?.lastRunTs ? Date.parse(definition.lastRunTs) : NaN, acceptedTime = Date.parse(receipt.acceptedTs);
    const eligible = Number.isFinite(acceptedTime) && (!definition?.lastRunId || definition.lastRunId === id || (Number.isFinite(oldTime) && oldTime < acceptedTime));
    return { runId: id, automationId: receipt.automationId, automationName: definition?.name ?? null, repoId: run.repoId, task: run.task, runStatus: run.status, acceptedAt: receipt.acceptedTs, retainedLocks: locks.length, definitionPresent: !!definition, eligible, reason: eligible ? 'History-only review; execution and ownership remain unchanged.' : 'Existing automation history is newer or ambiguous. Preserve it for separate review; this action cannot overwrite it.', digest };
  }
  list() { return this.db.select().from(automationDispatches).where(isNull(automationDispatches.recordedTs)).all().map((row) => this.review(row.runId)); }
  resolve(id: string, digest: unknown, confirmation: unknown) {
    const ts = new Date().toISOString();
    let projected = false;
    try {
      this.bus.commit((tx) => {
        const review = this.review(id);
        if (!review.eligible) throw new Error(review.reason);
        if (digest !== review.digest) throw new Error('Automation receipt changed; review it again');
        const required = review.definitionPresent ? 'RECORD AUTOMATION HISTORY' : 'ACKNOWLEDGE MISSING AUTOMATION';
        if (confirmation !== required) throw new Error(`Type ${required} to confirm this history-only action`);
        if (review.definitionPresent) {
          this.store.recordRecoveredRun(review.automationId, id, review.acceptedAt);
          projected = true;
        }
        tx.update(automationDispatches).set({ recordedTs: ts }).where(eq(automationDispatches.runId, id)).run();
        return review;
      }, (review) => [{
        id: `recovery-automation:${id}`, type: 'activity.appended', ts, source: { kind: 'app', ref: 'recovery' },
        payload: { item: { id: `recovery-automation:${id}`, icon: 'clock', tone: 'warning', title: 'Restored automation receipt reviewed',
          detail: review.definitionPresent ? `Recorded accepted run ${id} in automation ${review.automationId} history. No job, result or lock changed.` : `Acknowledged accepted run ${id} for missing automation ${review.automationId}. No definition or success evidence was created; no job or lock changed.`, ts, repoId: review.repoId } },
      }]);
    } catch (error) {
      if (projected) throw new Error('History was projected, but the receipt audit did not commit. The receipt remains pending; load a fresh review before retrying.');
      throw error;
    }
    return { reviewed: true, runId: id, historyProjected: projected, executionEnabled: false, locksReleased: false };
  }
}
