import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import type { Bus } from '../bus';
import { runs, executionLocks, verificationAttempts, planningTasks } from '../db/schema';
import { TaskExecutionStore } from '../runner/taskExecution';

export class RecoveryQueue {
  private tasks: TaskExecutionStore;
  constructor(private db: Db, private bus: Bus) { this.tasks = new TaskExecutionStore(db); }
  review(id: string) {
    const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
    if (!run) throw new Error('Run not found');
    const binding = this.tasks.get(id);
    const task = binding ? this.db.select().from(planningTasks).where(eq(planningTasks.id, binding.taskId)).get() : undefined;
    const locks = this.db.select().from(executionLocks).where(eq(executionLocks.runId, id)).all();
    const attempts = this.db.select().from(verificationAttempts).where(eq(verificationAttempts.runId, id)).all();
    const noExecutionRecorded = [run.processIdentity, run.processTermination, run.workspacePath, run.workspaceKind, run.workspaceGitIdentity, run.sourceGitIdentity, run.baseSha, run.branch, run.headSha, run.diffDigest, run.endedTs, run.exitCode, run.durationMs, run.resultText, run.diagnostics, run.tokensIn, run.tokensOut, run.turns, run.verifyVerdict, run.humanAction].every((value) => value === null);
    const eligible = run.status === 'queued' && run.engineVersion === 1 && noExecutionRecorded && !locks.length && !attempts.length && (!binding || (binding.state === 'queued' && task?.status === 'queued' && task.version === binding.currentTaskVersion));
    const digest = createHash('sha256').update(JSON.stringify({ run, binding, task, locks, attempts })).digest('hex');
    return { id: run.id, task: run.task, repoId: run.repoId, eligible, digest, reason: eligible ? 'Versioned queue record with no process, workspace, verification or owned lock recorded.' : 'This record is not a safely cancellable unstarted job. Preserve it for separate process/reference review.' };
  }
  list() { return this.db.select().from(runs).where(eq(runs.status, 'queued')).all().map((run) => this.review(run.id)); }
  cancel(id: string, digest: unknown, confirmation: unknown) {
    if (confirmation !== 'CANCEL QUEUED JOB') throw new Error('Explicit queued-job cancellation confirmation is required');
    const ts = new Date().toISOString();
    this.bus.commit((tx) => {
      const review = this.review(id);
      if (!review.eligible || digest !== review.digest) throw new Error('Queued job changed or cannot be safely cancelled; review it again');
      tx.update(runs).set({ status: 'failed', endedTs: ts, note: 'Cancelled explicitly during recovery review before process start' }).where(eq(runs.id, id)).run();
      this.tasks.transition(id, 'failed');
      return review;
    }, (review) => [{
      id: `recovery-cancel-build:${id}`, type: 'build.updated', ts, source: { kind: 'runner', ref: id },
      payload: { build: { id, repo: review.repoId, jobLabel: review.task.slice(0, 48), branch: 'agent', kind: 'agent', state: 'failed', startedTs: null, elapsedSec: null } },
    }, {
      id: `recovery-cancel:${id}`, type: 'activity.appended', ts, source: { kind: 'app', ref: 'recovery' },
      payload: { item: { id: `recovery-cancel:${id}`, icon: 'stop', tone: 'warning', title: 'Recovered queued job cancelled', detail: `Job ${id} was cancelled explicitly before process start. Existing writer locks were preserved.`, ts, repoId: review.repoId } },
    }]);
    return { cancelled: true, runId: id, locksReleased: false };
  }
}
