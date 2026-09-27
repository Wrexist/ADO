import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { runs, verificationEvidence } from '../db/schema';
import { workspaceEvidence } from './workspace';
import { spawnMerged } from '../lib/spawnMerged';
import { redact } from '../lib/redact';
import { ApprovalStore, type AcceptanceBinding } from './approvals';
import { TaskAcceptanceRequest, TaskReviewRequest } from '@ado/shared';
import { TaskReviewStore, type TaskCriterionBinding } from './taskReview';

export interface AcceptanceTarget { headSha?: string; diffDigest?: string; policyVersion?: string; approvalId?: string; operation?: string; verificationId?: string }

/** Verification is explicit: executes the repository's own npm verify script in trusted-local mode. */
export class Verifier {
  private active = new Set<string>();
  constructor(private db: Db, private secrets: () => Array<string | undefined>, private approvals = new ApprovalStore(db)) {}

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
    if (this.active.has(id)) throw new Error('Verification or acceptance already running');
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
    if (this.active.has(id)) throw new Error('Verification or acceptance already running');
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
  async verify(id: string) {
    if (this.active.has(id)) throw new Error('Verification already running');
    this.active.add(id);
    try {
      const run = this.db.select().from(runs).where(eq(runs.id, id)).get();
      if (!run || run.status !== 'done' || !run.workspacePath || !run.baseSha || !run.headSha || !run.diffDigest) throw new Error('A completed isolated run with captured evidence is required');
      // A new verification attempt invalidates old approval even if preflight fails.
      this.db.transaction(() => {
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
      const proc = spawnMerged(process.execPath, [npm, 'run', 'verify'], run.workspacePath);
      let output = '';
      const collect = async () => { for await (const line of proc.lines) output = (output + redact(line, this.secrets()) + '\n').slice(-16000); };
      let exitCode: number;
      try { [exitCode] = await Promise.all([proc.done, collect()]); }
      catch (error) { proc.kill(); await proc.done; throw error; }
      const after = await workspaceEvidence(run.workspacePath, run.baseSha);
      const unchanged = after.headSha === before.headSha && after.diffDigest === before.diffDigest;
      const verdict = exitCode === 0 && unchanged ? 'pass' : 'fail';
      const evidence = { id: randomUUID(), runId: id, ...before, command: 'npm run verify', exitCode, verdict, output: output + (unchanged ? '' : '\nResult changed during verification; evidence invalid.'), recordedTs: new Date().toISOString() };
      this.db.transaction((tx) => {
        tx.insert(verificationEvidence).values(evidence).run();
        tx.update(runs).set({ verifyVerdict: verdict }).where(eq(runs.id, id)).run();
      });
      return evidence;
    } finally { this.active.delete(id); }
  }
}
