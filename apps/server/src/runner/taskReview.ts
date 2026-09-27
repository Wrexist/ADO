import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { PlanningTask, TaskReviewRequest } from '@ado/shared';
import type { z } from 'zod';
import type { Db } from '../db';
import { planningTasks, planningDependencies, planningRevisions, taskExecutions, taskReviews, runs, executionLocks } from '../db/schema';
import { PlanningStore } from '../projects/planning';
import { workspaceEvidence } from './workspace';
import { ApprovalStore, LOCAL_OWNER, type AcceptanceBinding } from './approvals';

export type TaskCriterionBinding = { taskId: string; taskVersion: number; definitionVersion: number; criteria: z.infer<typeof TaskReviewRequest>['criteria'] };

/** Human criterion decisions are distinct from process success and automated verification. */
export class TaskReviewStore {
  constructor(private db: Db) {}

  binding(taskId: string, input: Pick<z.infer<typeof TaskReviewRequest>, 'runId' | 'version' | 'criteria'>): TaskCriterionBinding {
    const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, taskId)).get();
    const execution = this.db.select().from(taskExecutions).where(eq(taskExecutions.runId, input.runId)).get();
    if (!task || task.status !== 'awaiting_review' || task.version !== input.version || !execution || execution.taskId !== taskId || execution.state !== 'done' || execution.currentTaskVersion !== task.version) throw new Error('Review requires the exact current awaiting-review task and its successful run');
    if (this.db.select().from(executionLocks).where(eq(executionLocks.runId, input.runId)).get()) throw new Error('Task process stop is not confirmed');
    const definition = PlanningTask.parse(JSON.parse(execution.taskSnapshotJson));
    const supplied = new Map(input.criteria.map((c) => [c.criterionId, c]));
    if (supplied.size !== input.criteria.length || supplied.size !== definition.acceptance.length || definition.acceptance.some((c) => !supplied.has(c.id))) throw new Error('Review every exact criterion once; unknown, missing or duplicate criteria are refused');
    for (const criterion of definition.acceptance) if (criterion.required && supplied.get(criterion.id)!.verdict !== 'pass') throw new Error('All required criteria must pass with explicit evidence');
    const unresolved = this.db.select().from(planningDependencies).where(eq(planningDependencies.taskId, taskId)).all().some((d) => this.db.select().from(planningTasks).where(eq(planningTasks.id, d.dependsOn)).get()?.status !== 'accepted');
    if (unresolved) throw new Error('Task dependencies are no longer accepted');
    return { taskId, taskVersion: task.version, definitionVersion: execution.taskVersion, criteria: definition.acceptance.map((c) => supplied.get(c.id)!) };
  }

  private transition(taskId: string, runId: string, version: number, status: 'accepted' | 'awaiting_review') {
    const changed = this.db.update(planningTasks).set({ status, version: version + 1, updatedTs: new Date().toISOString() }).where(and(eq(planningTasks.id, taskId), eq(planningTasks.version, version))).run();
    if (changed.changes !== 1) throw new Error('Task changed during criterion review');
    this.db.update(taskExecutions).set({ currentTaskVersion: version + 1 }).where(eq(taskExecutions.runId, runId)).run();
    const snapshot = new PlanningStore(this.db).snapshot().tasks.find((t) => t.id === taskId)!;
    this.db.insert(planningRevisions).values({ id: randomUUID(), entityId: taskId, kind: 'task', version: snapshot.version, snapshotJson: JSON.stringify(snapshot), recordedTs: new Date().toISOString() }).run();
  }

  accept(id: string, binding: AcceptanceBinding) {
    const task = binding.taskReview;
    if (!task || binding.operation !== 'task.accept') throw new Error('A task criterion binding is required');
    // Called inside the same transaction that consumes the operation approval.
    const current = this.binding(task.taskId, { runId: binding.runId, version: task.taskVersion, criteria: task.criteria });
    if (JSON.stringify(current) !== JSON.stringify(task)) throw new Error('Task definition changed during review');
    this.db.insert(taskReviews).values({ id, taskId: task.taskId, taskVersion: task.taskVersion, definitionVersion: task.definitionVersion, acceptedTaskVersion: task.taskVersion + 1, runId: binding.runId, verificationId: binding.verificationId, headSha: binding.headSha, diffDigest: binding.diffDigest, criteriaJson: JSON.stringify(task.criteria), actorId: LOCAL_OWNER, recordedTs: new Date().toISOString() }).run();
    this.transition(task.taskId, binding.runId, task.taskVersion, 'accepted');
  }

  invalidateRun(runId: string, reason: string) {
    this.db.transaction(() => {
      for (const review of this.db.select().from(taskReviews).where(and(eq(taskReviews.runId, runId), isNull(taskReviews.invalidatedTs))).all()) {
        this.db.update(taskReviews).set({ invalidatedTs: new Date().toISOString(), invalidationReason: reason }).where(eq(taskReviews.id, review.id)).run();
        const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, review.taskId)).get();
        if (task?.status === 'accepted' && task.version === review.acceptedTaskVersion) this.transition(task.id, runId, task.version, 'awaiting_review');
      }
    });
  }

  async recheck(taskId: string): Promise<boolean> {
    const review = this.db.select().from(taskReviews).where(and(eq(taskReviews.taskId, taskId), isNull(taskReviews.invalidatedTs))).get();
    if (!review) return false;
    const run = this.db.select().from(runs).where(eq(runs.id, review.runId)).get();
    let valid = false;
    try {
      if (run?.status === 'done' && run.verifyVerdict === 'pass' && run.humanAction === 'accepted' && run.workspacePath && run.baseSha && run.headSha === review.headSha && run.diffDigest === review.diffDigest) {
        const current = await workspaceEvidence(run.workspacePath, run.baseSha);
        valid = current.headSha === review.headSha && current.diffDigest === review.diffDigest;
      }
    } catch { /* Missing or unreadable content cannot prove acceptance remains current. */ }
    if (!valid) this.db.transaction(() => {
      const reason = 'Accepted task result changed or could not be verified';
      this.invalidateRun(review.runId, reason);
      new ApprovalStore(this.db).invalidateRun(review.runId, reason);
      this.db.update(runs).set({ verifyVerdict: null, humanAction: null }).where(and(eq(runs.id, review.runId), eq(runs.humanAction, 'accepted'))).run();
    });
    const latest = this.db.select().from(taskReviews).where(eq(taskReviews.id, review.id)).get();
    const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, taskId)).get();
    return valid && Boolean(latest && !latest.invalidatedTs && task?.status === 'accepted' && task.version === review.acceptedTaskVersion);
  }

  async recheckDependencies(taskId: string, visited = new Set<string>()) {
    if (visited.has(taskId)) return;
    visited.add(taskId);
    for (const dependency of this.db.select().from(planningDependencies).where(eq(planningDependencies.taskId, taskId)).all()) {
      if (!await this.recheck(dependency.dependsOn)) throw new Error('Dependency acceptance is stale; review its current result');
      await this.recheckDependencies(dependency.dependsOn, visited);
    }
  }
}
