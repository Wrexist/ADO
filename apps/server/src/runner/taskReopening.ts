import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { TaskReopeningRequest } from '@ado/shared';
import type { Db } from '../db';
import { planningTasks, planningRevisions, taskExecutions, executionLocks, taskReopenings } from '../db/schema';
import { PlanningStore } from '../projects/planning';
import { ApprovalStore, LOCAL_OWNER } from './approvals';
import { TaskReviewStore } from './taskReview';

/** Explicitly leave review, retaining every prior attempt and artifact. Never dispatches. */
export class TaskReopeningStore {
  constructor(private db: Db, private reviewBusy: (runId: string) => boolean = () => false) {}
  reopen(taskId: string, input: unknown) {
    const request = TaskReopeningRequest.parse(input);
    const requestHash = createHash('sha256').update(JSON.stringify([taskId, request.runId, request.version, request.reason])).digest('hex');
    return this.db.transaction(() => {
      const previous = this.db.select().from(taskReopenings).where(eq(taskReopenings.idempotencyKey, request.idempotencyKey)).get();
      const currentTask = () => new PlanningStore(this.db).snapshot().tasks.find((t) => t.id === taskId)!;
      if (previous) {
        if (previous.requestHash !== requestHash) throw new Error('Reopening idempotency conflict: request content differs');
        return { reopeningId: previous.id, task: currentTask() };
      }
      const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, taskId)).get();
      const execution = this.db.select().from(taskExecutions).where(eq(taskExecutions.runId, request.runId)).get();
      if (!task || task.version !== request.version || !['awaiting_review', 'accepted', 'blocked'].includes(task.status) || !execution || execution.taskId !== taskId || execution.currentTaskVersion !== task.version || !['done', 'failed'].includes(execution.state)) throw new Error('Reopening requires the exact current finished task attempt');
      if (this.db.select().from(taskExecutions).innerJoin(executionLocks, eq(taskExecutions.runId, executionLocks.runId)).where(eq(taskExecutions.taskId, taskId)).get()) throw new Error('Task process stop is not confirmed; reopening remains blocked');
      if (this.db.select().from(taskExecutions).where(and(eq(taskExecutions.taskId, taskId), inArray(taskExecutions.state, ['queued', 'running']))).get()) throw new Error('A task attempt is still active');
      const attempts = this.db.select().from(taskExecutions).where(eq(taskExecutions.taskId, taskId)).all();
      if (attempts.some((attempt) => this.reviewBusy(attempt.runId))) throw new Error('Verification or result review is still active; wait before reopening');
      // Revocation may add a lifecycle revision of its own. Both it and the new
      // draft belong to this transaction and roll back if the audit write fails.
      new TaskReviewStore(this.db).invalidateRun(request.runId, 'Task reopened for revision');
      for (const attempt of attempts) new ApprovalStore(this.db).invalidateRun(attempt.runId, 'Task reopened for revision');
      const current = this.db.select().from(planningTasks).where(eq(planningTasks.id, taskId)).get()!;
      const toVersion = current.version + 1, now = new Date().toISOString();
      const changed = this.db.update(planningTasks).set({ status: 'draft', version: toVersion, updatedTs: now }).where(and(eq(planningTasks.id, taskId), eq(planningTasks.version, current.version))).run();
      if (changed.changes !== 1) throw new Error('Task changed during reopening');
      const result = currentTask();
      this.db.insert(planningRevisions).values({ id: randomUUID(), entityId: taskId, kind: 'task', version: toVersion, snapshotJson: JSON.stringify(result), recordedTs: now }).run();
      const id = randomUUID();
      this.db.insert(taskReopenings).values({ id, taskId, runId: request.runId, fromVersion: request.version, toVersion, reason: request.reason, idempotencyKey: request.idempotencyKey, requestHash, actorId: LOCAL_OWNER, recordedTs: now }).run();
      return { reopeningId: id, task: result };
    });
  }
}
