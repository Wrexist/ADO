import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { runs, verificationEvidence, taskExecutions, planningTasks } from '../db/schema';
import { workspaceEvidence } from './workspace';
import { spawnOwned, type OwnedProcess } from '../lib/ownedProcess';
import { boundedDiagnostics } from '../lib/processOutput';
import { VerificationOwnership } from './verificationOwnership';
import { ProcessNotStartedError } from '../lib/processLaunch';
import { ApprovalStore, type AcceptanceBinding } from './approvals';
import { TaskAcceptanceRequest, TaskReviewRequest } from '@ado/shared';
import { TaskReviewStore, type TaskCriterionBinding } from './taskReview';

export interface AcceptanceTarget { headSha?: string; diffDigest?: string; policyVersion?: string; approvalId?: string; operation?: string; verificationId?: string }

/** Verification is explicit: executes the repository's own npm verify script in trusted-local mode. */
export class Verifier {
  private active = new Set<string>();
  private processes = new Map<string, OwnedProcess>();
  private jobs = new Set<Promise<unknown>>();
  private verifying = new Set<string>();
  private stopped = false;
  private cancelled = new Set<string>();
  private ownership: VerificationOwnership;
  constructor(private db: Db, private secrets: () => Array<string | undefined>, private approvals = new ApprovalStore(db), private options: { receiptRoot?: string; cwdFor?: (repoId: string) => string | undefined; resourceFor?: (repoId: string, cwd: string) => string; released?: () => void; spawn?: typeof spawnOwned } = {}) {
    this.ownership = new VerificationOwnership(db, options.receiptRoot, options.cwdFor, options.resourceFor);
  }
  isActive(id: string) { return this.active.has(id) || this.ownership.busy(id); }
  reconcile(runId?: string) {
    if (runId ? this.active.has(runId) : this.active.size) throw new Error('Cannot reconcile while this verifier is active');
    const recovered = this.ownership.reconcile(runId);
    if (recovered) this.options.released?.();
    return recovered;
  }
  cancel(id: string) {
    if (!this.verifying.has(id)) throw new Error('No live verification owned by this server; recheck its stop receipt');
    this.cancelled.add(id);
    this.processes.get(id)?.kill();
  }
  async stop() {
    this.stopped = true;
    for (const proc of this.processes.values()) proc.kill();
    await Promise.allSettled([...this.jobs]);
  }

  private invalidateResult(run: typeof runs.$inferSelect) {
    this.db.transaction(() => {
      this.db.update(runs).set({ verifyVerdict: null, humanAction: sql`CASE WHEN ${runs.humanAction} = 'accepted' THEN NULL ELSE ${runs.humanAction} END` })
        .where(and(eq(runs.id, run.id), eq(runs.status, 'done'), eq(runs.verifyVerdict, 'pass'), eq(runs.workspacePath, run.workspacePath!), eq(runs.baseSha, run.baseSha!), eq(runs.headSha, run.headSha!), eq(runs.diffDigest, run.diffDigest!))).run();
      this.approvals.invalidateRun(run.id, 'Result changed or could not be read');
      new TaskReviewStore(this.db).invalidateRun(run.id, 'Result changed or could not be read');
    });
  }

  private binding(run: typeof runs.$inferSelect, taskReview?: TaskCriterionBinding): AcceptanceBinding {
    const evidence = this.db.select().from(verificationEvidence).where(and(eq(verificationEvidence.runId, run.id), eq(verificationEvidence.verdict, 'pass'), eq(verificationEvidence.headSha, run.headSha!), eq(verificationEvidence.diffDigest, run.diffDigest!)))
      .orderBy(desc(verificationEvidence.recordedTs), desc(verificationEvidence.id)).get();
    if (!evidence) throw new Error('Independent verification evidence is required');
    return { operation: taskReview ? 'task.accept' : 'result.accept', runId: run.id, repoId: run.repoId, headSha: run.headSha!, diffDigest: run.diffDigest!, workspacePath: run.workspacePath!, baseSha: run.baseSha!, verificationId: evidence.id, priorHumanAction: run.humanAction, taskReview };
  }

  async prepareTaskAcceptance(taskId: string, input: unknown) {
    const request = TaskReviewRequest.parse(input), store = new TaskReviewStore(this.db);
    await store.recheckDependencies(taskId);
    return this.prepareAcceptance(request.runId, request, store.binding(taskId, request));
  }

  async acceptTask(taskId: string, input: unknown) {
    const request = TaskAcceptanceRequest.parse(input), store = new TaskReviewStore(this.db);
    await store.recheckDependencies(taskId);
    return this.accept(request.runId, request, store.binding(taskId, request));
  }

  changeOutcome(id: string, humanAction: 'accepted' | 'corrected' | 'redone') {
    this.db.transaction(() => {
      this.approvals.invalidateRun(id, 'Human outcome changed');
      new TaskReviewStore(this.db).invalidateRun(id, 'Human outcome changed');
      this.db.update(runs).set({ humanAction }).where(eq(runs.id, id)).run();
    });
  }

  async prepareAcceptance(id: string, target: AcceptanceTarget, taskReview?: TaskCriterionBinding) {
    if (this.isActive(id)) throw new Error('Verification or acceptance already running, or writer quarantined');
    this.active.add(id);
    try {
      const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
      if (target.operation !== (taskReview ? 'task.accept' : 'result.accept') || !target.policyVersion || !run || run.engineVersion !== 1 || run.status !== 'done' || run.verifyVerdict !== 'pass' || !run.workspacePath || !run.baseSha || !run.headSha || !run.diffDigest || target.headSha !== run.headSha || target.diffDigest !== run.diffDigest) throw new Error('Review requires the exact independently verified result and operation');
      try {
        const current = await workspaceEvidence(run.workspacePath, run.baseSha);
        if (current.headSha !== run.headSha || current.diffDigest !== run.diffDigest) throw new Error('Result changed after verification; review is stale');
      } catch (error) { this.invalidateResult(run); throw error; }
      const binding = this.binding(run, taskReview);
      if (taskReview && target.verificationId !== binding.verificationId) throw new Error('Verification evidence changed; reload and review its current output');
      return this.approvals.prepare(binding, target.policyVersion);
    } finally { this.active.delete(id); }
  }

  async accept(id: string, target: AcceptanceTarget, taskReview?: TaskCriterionBinding) {
    if (this.isActive(id)) throw new Error('Verification or acceptance already running, or writer quarantined');
    this.active.add(id);
    try {
      const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
      if (!run || run.status !== 'done' || run.verifyVerdict !== 'pass' || !run.workspacePath || !run.baseSha || !run.headSha || !run.diffDigest || target.headSha !== run.headSha || target.diffDigest !== run.diffDigest) throw new Error('Acceptance requires verification and the exact reviewed revision and diff');
      if (!target.approvalId || !target.policyVersion || target.operation !== (taskReview ? 'task.accept' : 'result.accept')) throw new Error('Prepare and explicitly confirm the current result review');
      const binding = this.binding(run, taskReview);
      if (taskReview && target.verificationId !== binding.verificationId) throw new Error('Verification evidence changed; reload and review its current output');
      const unchangedResult = and(eq(runs.id, id), eq(runs.status, 'done'), eq(runs.verifyVerdict, 'pass'), eq(runs.workspacePath, run.workspacePath), eq(runs.baseSha, run.baseSha), eq(runs.headSha, run.headSha), eq(runs.diffDigest, run.diffDigest));
      const unchangedRow = and(unchangedResult, run.humanAction === null ? isNull(runs.humanAction) : eq(runs.humanAction, run.humanAction));
      try {
        const current = await workspaceEvidence(run.workspacePath, run.baseSha);
        if (current.headSha !== run.headSha || current.diffDigest !== run.diffDigest) throw new Error('Result changed after verification; approval is stale');
      } catch (error) {
        // A simultaneous correction must not preserve stale green evidence or
        // be overwritten when we revoke an acceptance of the changed result.
        this.invalidateResult(run);
        throw error;
      }
      return this.approvals.consume(target.approvalId, binding, target.policyVersion, () => {
        const updated = this.db.update(runs).set({ humanAction: 'accepted' }).where(unchangedRow).run();
        if (updated.changes !== 1) throw new Error('Run changed during review; reload and review the current result');
        if (taskReview) new TaskReviewStore(this.db).accept(target.approvalId!, binding);
        return { ...run, humanAction: 'accepted' };
      });
    } finally { this.active.delete(id); }
  }
  verify(id: string) {
    const job = this.verifyOwned(id);
    this.jobs.add(job);
    void job.finally(() => this.jobs.delete(job)).catch(() => {});
    return job;
  }
  private async verifyOwned(id: string) {
    if (this.stopped) throw new Error('Verifier is stopping');
    if (this.isActive(id)) throw new Error('Verification already running, or writer quarantined');
    this.active.add(id);
    let attemptId: string | undefined;
    this.verifying.add(id);
    let proc: OwnedProcess | undefined;
    let spawned = false;
    let settled = false;
    let finished = false;
    try {
      const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
      if (!run || run.status !== 'done' || !run.workspacePath || !run.baseSha || !run.headSha || !run.diffDigest) throw new Error('A completed isolated run with captured evidence is required');
      const execution = this.db.select().from(taskExecutions).where(eq(taskExecutions.runId, id)).get();
      if (execution) {
        const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, execution.taskId)).get();
        if (!task || task.version !== execution.currentTaskVersion || !['awaiting_review', 'accepted'].includes(task.status)) throw new Error('This task attempt is historical; verification cannot write to its retained working copy');
      }
      // A new verification attempt invalidates old approval even if preflight fails.
      this.db.transaction(() => {
        attemptId = this.ownership.claim(run);
        this.approvals.invalidateRun(id, 'New verification requested');
        new TaskReviewStore(this.db).invalidateRun(id, 'New verification requested');
        this.db.update(runs).set({ verifyVerdict: null, humanAction: null }).where(eq(runs.id, id)).run();
      });
      const before = await workspaceEvidence(run.workspacePath, run.baseSha);
      if (before.headSha !== run.headSha || before.diffDigest !== run.diffDigest) throw new Error('Working copy changed since the run; start a new attempt');
      const pkg = JSON.parse(readFileSync(join(run.workspacePath, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> };
      if (typeof pkg.scripts?.verify !== 'string') throw new Error('Repository must define an explicit npm verify script');
      const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
      const npm = candidates.find((p): p is string => Boolean(p && p.endsWith('npm-cli.js') && existsSync(p)));
      if (!npm) throw new Error('npm CLI unavailable on this host');
      if (this.stopped || this.cancelled.has(id)) throw new Error('Verification was stopped');
      this.ownership.assertRunning(attemptId!);
      // Mark spawning before calling the adapter: a thrown adapter error cannot
      // establish that it created no process. Keep that uncertainty quarantined.
      spawned = true;
      proc = (this.options.spawn ?? spawnOwned)(process.execPath, [npm, 'run', 'verify'], run.workspacePath, (identity) => this.ownership.identify(attemptId!, identity), this.options.receiptRoot);
      this.processes.set(id, proc);
      const stdout = boundedDiagnostics(proc.child.stdout, this.secrets());
      const stderr = boundedDiagnostics(proc.child.stderr, this.secrets());
      proc.child.stdin.end();
      const exitCode = await proc.done;
      settled = true;
      if (process.platform === 'win32' && !proc.terminationConfirmed()) throw new Error('Verification process termination is unconfirmed');
      if (this.stopped) throw new Error('Verification stopped during shutdown');
      if (this.cancelled.has(id)) throw new Error('Verification was stopped');
      const output = [stdout(), stderr()].filter(Boolean).join('\n');
      const after = await workspaceEvidence(run.workspacePath, run.baseSha);
      if (this.stopped || this.cancelled.has(id)) throw new Error('Verification was stopped');
      const unchanged = after.headSha === before.headSha && after.diffDigest === before.diffDigest;
      const verdict = exitCode === 0 && unchanged ? 'pass' : 'fail';
      const evidence = { id: randomUUID(), attemptId: attemptId!, runId: id, ...before, command: 'npm run verify', exitCode, verdict, output: output + (unchanged ? '' : '\nResult changed during verification; evidence invalid.'), recordedTs: new Date().toISOString() };
      this.db.transaction((tx) => {
        this.ownership.assertRunning(attemptId!);
        tx.insert(verificationEvidence).values(evidence).run();
        tx.update(runs).set({ verifyVerdict: verdict }).where(eq(runs.id, id)).run();
        this.ownership.finish(attemptId!, verdict === 'pass' ? 'succeeded' : 'failed', proc!.terminationConfirmed() ? 'confirmed' : 'root_exited', true);
      });
      finished = true;
      return evidence;
    } catch (error) {
      if (proc && !settled) { proc.kill(); await proc.done.catch(() => {}); }
      if (attemptId) {
        const confirmed = Boolean(proc?.terminationConfirmed());
        const notStarted = !spawned || (!proc && error instanceof ProcessNotStartedError);
        const release = notStarted || confirmed || (process.platform !== 'win32' && settled);
        this.db.transaction(() => this.ownership.finish(attemptId!, release ? 'failed' : 'termination_unconfirmed', notStarted ? 'not_started' : confirmed ? 'confirmed' : settled && process.platform !== 'win32' ? 'root_exited' : 'unconfirmed', release, 'Verification did not produce accepted evidence'));
        finished = release;
      }
      throw error;
    } finally {
      this.active.delete(id);
      this.verifying.delete(id);
      this.processes.delete(id);
      this.cancelled.delete(id);
      if (finished) this.options.released?.();
    }
  }
}
