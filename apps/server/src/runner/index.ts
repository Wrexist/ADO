/**
 * Runner (Prompts 3.1–3.2): dispatch headless `claude -p` agents, stream their progress
 * as typed bus events, and log every run.
 *
 * Safety rails (council B4): a dispatch semaphore (max N concurrent) backs the Build
 * Queue — excess dispatches are `queued`, not spawned; each run has a wall-clock timeout;
 * spawns get a turn cap + minimal env (in the Spawner). Registry survives restart: a
 * `running` row on boot is an orphan, reconciled to `failed`.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db';
import { automationDispatches, executionLocks, runs, portfolioCheckouts } from '../db/schema';
import { TaskDispatchRequest } from '@ado/shared';
import { TaskExecutionStore, taskPrompt, type TaskRunBinding } from './taskExecution';
import { commonGitIdentity } from '../projects/checkoutIdentity';
import { TaskReviewStore } from './taskReview';
import { parseStreamLine, type AgentUpdate } from './adapter';
import type { Spawner, SpawnHandle } from './spawner';
import { createHash, randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { redact } from '../lib/redact';
import { assertWorkspaceIdentity, prepareWorkspace, workspaceEvidence } from './workspace';
import { readTerminationReceipt } from '../lib/terminationReceipt';
import { verificationBlocks } from './verificationOwnership';
import { ProcessNotStartedError } from '../lib/processLaunch';
import { executionCapacityAvailable, executionCapacityReason } from './executionCapacity';

export interface DispatchInput {
  repoId: string;
  task: string;
  model?: string;
  provider?: string;
  idempotencyKey?: string;
  taskBinding?: TaskRunBinding;
  automationId?: string;
}

interface RunnerOpts {
  maxConcurrent?: number;
  turnCap?: number;
  timeoutMs?: number;
  defaultProvider?: 'claude' | 'codex';
  workspaceRoot?: string;
  /** Throws when a task base is not the verified default-branch head and was not explicitly chosen. */
  assertDefaultBase?: (checkoutId: string, baseSha: string, nonDefaultBase: boolean) => void;
  receiptRoot?: string;
  secrets?: () => Array<string | undefined>;
  /** repoId → absolute cwd (the allow-list; a dispatch outside it is rejected). */
  cwdFor: (repoId: string) => string | null;
  assertCheckout?: (checkoutId: string, sourceId: string, cwd: string) => unknown;
  /**
   * Per-project switch (project settings → "Agent dispatch"). Returning a string blocks the
   * dispatch with that reason. Checked FIRST so every dispatch path — command box, prompts,
   * automations, incident/review fixes — honors the switch through this one choke point.
   */
  blockedReason?: (repoId: string) => string | null;
  /** Defer persisted queue claims until an explicit runtime prerequisite is ready. */
  queuePaused?: () => string | null;
  /**
   * Called once when a run finishes (success or failure) with the agent's final text (null
   * when the stream carried none). Consumers parse it for verified-outcome markers — e.g.
   * the TestFlight watcher records a deploy only from a marker. Guarded: a throwing hook
   * never breaks the runner.
   */
  onRunDone?: (runId: string, info: { repoId: string; ok: boolean; resultText: string | null }) => void;
}

const DEFAULTS = { maxConcurrent: 2, turnCap: 20, timeoutMs: 15 * 60_000 };
/** How many recent agent ids to keep on a repo for the avatar stack (newest first). */
const REPO_AGENT_CAP = 5;

/** Live-timeline ring cap per run — enough to follow a long run, never unbounded. */
const TIMELINE_CAP = 200;

export interface TimelineEntry {
  ts: string;
  kind: 'status' | 'tool' | 'progress';
  text: string;
}

export class Runner {
  private readonly owner = randomUUID();
  private active = 0;
  private draining = false;
  private seq = 0; // guarantees unique run ids even for same-millisecond dispatches
  private queue: Array<{ id: string; input: DispatchInput }> = [];
  private handles = new Map<string, SpawnHandle>();
  /** A rejected exit promise is not evidence that the writer has stopped. */
  private unconfirmedProcesses = new Set<string>();
  private stopped = false;
  private jobs = new Set<Promise<void>>();
  private busyDirectories = new Set<string>();
  private activeRuns = new Set<string>();
  /** In-memory tool-by-tool timelines for runs started THIS boot (live observability).
   *  Bounded per run and pruned past a global cap; older runs honestly have none. */
  private timelines = new Map<string, TimelineEntry[]>();
  /** Runs the user killed from the dashboard — so the exit path records WHY it failed. */
  private killed = new Set<string>();
  private opts: Required<Pick<RunnerOpts, 'maxConcurrent' | 'turnCap' | 'timeoutMs'>> & RunnerOpts;
  private taskExecutions: TaskExecutionStore;

  constructor(
    private bus: Bus,
    private db: Db,
    private spawner: Spawner,
    opts: RunnerOpts,
    private log: (msg: string) => void = () => {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
    this.taskExecutions = new TaskExecutionStore(db, this.opts.secrets);
    this.log = (message) => log(redact(message, this.opts.secrets?.()));
  }

  /**
   * Restore versioned queued jobs; never restart an attempt that might have spawned.
   * Legacy runs remain explicit failures. Historically: a `running` row's
   * process died with the previous server, and the in-memory queue that owned the
   * `queued` rows is gone — neither can ever resolve itself → failed.
   */
  reconcileOrphans(): number {
    const orphans = this.db.select().from(runs).where(inArray(runs.status, ['running', 'queued'])).all().filter((run) => !this.activeRuns.has(run.id));
    for (const o of orphans) {
      if (o.engineVersion === 1 && o.status === 'queued') {
        if (!this.queue.some((q) => q.id === o.id)) this.queue.push({ id: o.id, input: { repoId: o.repoId, task: o.task, model: o.model === 'default' ? undefined : o.model, provider: o.provider } });
        continue;
      }
      // A crash before identity persistence is still an unknown process outcome.
      // Persist that uncertainty so the UI does not mistake missing metadata for
      // an ordinary terminal run without a retained writer.
      this.failRun(o.id, { repoId: o.repoId, task: o.task, model: o.model === 'default' ? undefined : o.model, provider: o.provider }, null, o.engineVersion === 1 ? 'interrupted; previous process outcome unknown; writer lock retained' : 'orphaned on boot', o.engineVersion === 1);
    }
    for (const lock of this.db.select().from(executionLocks).all()) this.recoverReceipt(lock.runId);
    this.drainNext();
    return orphans.length;
  }

  /** Recheck evidence only. Never kill by a persisted PID or retry the old attempt. */
  reconcileRun(runId: string): boolean {
    const recovered = this.recoverReceipt(runId);
    if (recovered) this.drainNext();
    return recovered;
  }

  private recoverReceipt(runId: string): boolean {
    if (!this.opts.receiptRoot || this.isLive(runId)) return false;
    const run = this.db.select().from(runs).where(eq(runs.id, runId)).get();
    const lock = this.db.select().from(executionLocks).where(eq(executionLocks.runId, runId)).get();
    if (!run || !lock || lock.owner.startsWith('verify:') || run.status !== 'failed') return false;
    const receipt = readTerminationReceipt(this.opts.receiptRoot, run.processIdentity);
    if (!receipt) return false;
    const ts = new Date().toISOString();
    return this.bus.commit((tx) => {
      const current = tx.select().from(runs).where(eq(runs.id, runId)).get();
      const currentLock = tx.select().from(executionLocks).where(eq(executionLocks.resource, lock.resource)).get();
      if (!current || current.status !== 'failed' || current.processIdentity !== run.processIdentity || currentLock?.runId !== runId || currentLock.owner !== lock.owner) return false;
      tx.update(runs).set({ processTermination: 'confirmed', exitCode: receipt.exitCode,
        note: 'interrupted; durable receipt confirms owned processes stopped; previous attempt not retried',
      }).where(eq(runs.id, runId)).run();
      tx.delete(executionLocks).where(eq(executionLocks.resource, lock.resource)).run();
      return true;
    }, (recovered) => recovered ? [{
      id: `process-recovered:${runId}:${receipt.id}`, type: 'activity.appended', ts,
      source: { kind: 'runner', ref: runId },
      payload: { item: { id: `process-recovered:${runId}`, icon: 'check', tone: 'info', title: run.repoId,
        detail: 'Owned processes confirmed stopped; writer lock released. Previous attempt was not retried.', ts, repoId: run.repoId } },
    }] : []);
  }

  /** Append to a run's live timeline (bounded ring; prunes the oldest runs' timelines). */
  private record(runId: string, kind: TimelineEntry['kind'], text: string): void {
    text = redact(text, this.opts.secrets?.());
    let t = this.timelines.get(runId);
    if (!t) {
      t = [];
      this.timelines.set(runId, t);
      // Global bound: keep timelines for the most recent ~50 runs of this boot.
      if (this.timelines.size > 50) {
        const oldest = this.timelines.keys().next().value;
        if (oldest) this.timelines.delete(oldest);
      }
    }
    t.push({ ts: new Date().toISOString(), kind, text });
    if (t.length > TIMELINE_CAP) t.splice(0, t.length - TIMELINE_CAP);
  }

  /** The live timeline captured this boot, or null when the run predates it (honest absence). */
  timeline(runId: string): TimelineEntry[] | null {
    return this.timelines.get(runId) ?? null;
  }

  /** Is the run in flight right now (spawned or still queued)? */
  isLive(runId: string): boolean {
    return this.activeRuns.has(runId) || this.queue.some((q) => q.id === runId);
  }

  /**
   * Kill a running run (SIGTERM — the exit path records it) or cancel a queued one.
   * Returns false when the run isn't in flight (finished / unknown / predates this boot).
   */
  kill(runId: string): boolean {
    const queuedIdx = this.queue.findIndex((q) => q.id === runId);
    if (queuedIdx >= 0) {
      const [q] = this.queue.splice(queuedIdx, 1);
      this.record(runId, 'status', 'Cancelled before start');
      this.failRun(q.id, q.input, null, 'cancelled from the dashboard before it started');
      return true;
    }
    const handle = this.handles.get(runId);
    if (!handle && !this.activeRuns.has(runId)) return false;
    this.killed.add(runId);
    this.record(runId, 'status', 'Kill requested from the dashboard');
    this.log(`runner: ${runId} killed from the dashboard`);
    handle?.kill();
    return true;
  }

  /** Accept a dispatch. Returns the runId, or throws if blocked/not allow-listed. */
  dispatchTask(taskId: string, input: unknown) {
    const request = TaskDispatchRequest.parse(input);
    const task = this.taskExecutions.revision(taskId, request.version);
    const existing = this.db.select().from(runs).where(eq(runs.idempotencyKey, request.idempotencyKey)).get();
    const checkout = this.db.select().from(portfolioCheckouts).where(eq(portfolioCheckouts.id, request.checkoutId)).get();
    if (!checkout) throw new Error('Checkout not found');
    if (!existing) this.opts.assertDefaultBase?.(request.checkoutId, request.baseSha, request.nonDefaultBase === true);
    return this.dispatch({ repoId: existing?.repoId ?? checkout.sourceId, task: taskPrompt(task), provider: request.provider, model: request.model, idempotencyKey: request.idempotencyKey,
      taskBinding: { taskId, taskVersion: request.version, checkoutId: request.checkoutId, baseSha: request.baseSha, ...(request.contextPackage ? { contextPackage: request.contextPackage } : {}) } });
  }

  taskExecution(runId: string) { return this.taskExecutions.get(runId); }

  dispatch(input: DispatchInput): { runId: string } {
    if (this.stopped) throw new Error('runner is stopping; no new dispatches accepted');
    input = { ...input, provider: input.provider ?? this.opts.defaultProvider ?? 'claude' };
    if (!['claude', 'codex'].includes(input.provider!)) throw new Error('Unsupported provider');
    if (input.automationId) {
      const pending = this.db.select().from(automationDispatches).where(and(eq(automationDispatches.automationId, input.automationId), isNull(automationDispatches.recordedTs))).get();
      if (pending) return { runId: pending.runId };
    }
    const requestHash = createHash('sha256').update(JSON.stringify([input.repoId, input.task, input.model ?? 'default', input.provider, ...(input.taskBinding ? [input.taskBinding] : [])])).digest('hex');
    if (input.idempotencyKey) {
      if (input.idempotencyKey.length > 200) throw new Error('idempotency key too long');
      const existing = this.db.select().from(runs).where(eq(runs.idempotencyKey, input.idempotencyKey)).get();
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error('idempotency conflict: request content differs');
        return { runId: existing.id };
      }
    }
    const blocked = this.opts.blockedReason?.(input.repoId);
    if (blocked) throw new Error(blocked);
    const cwd = this.opts.cwdFor(input.repoId);
    if (!cwd) throw new Error(`repo '${input.repoId}' is not in the scanner allow-list`);
    if (input.taskBinding) {
      if (!this.opts.workspaceRoot || !this.opts.assertCheckout) throw new Error('Task dispatch requires an isolated workspace and checkout identity validation');
      this.opts.assertCheckout(input.taskBinding.checkoutId, input.repoId, cwd);
    }

    const runId = `run-${input.repoId}-${Date.now()}-${++this.seq}-${randomUUID()}`;
    const now = new Date().toISOString();
    this.bus.commit((tx) => { tx
      .insert(runs)
      .values({ id: runId, repoId: input.repoId, task: input.task, model: input.model ?? 'default', provider: input.provider, status: 'queued', startedTs: now, engineVersion: 1, idempotencyKey: input.idempotencyKey, requestHash })
      .run();
      if (input.taskBinding) this.taskExecutions.enqueue(runId, input.taskBinding, input.task);
      if (input.automationId) tx.insert(automationDispatches).values({ runId, automationId: input.automationId, acceptedTs: now }).run();
    }, [this.buildEvent(runId, input, 'queued', null)]);

    // Reflect as a queued build immediately (backs the Build Queue), then let the
    // semaphore-aware drain start it now or hold it until a slot frees.
    this.record(runId, 'status', 'Queued');
    this.queue.push({ id: runId, input });
    this.drainNext();
    return { runId };
  }

  /** Start queued runs up to the concurrency limit; fail any whose cwd is no longer allowed. */
  wake(): void { this.drainNext(); }

  /** Derived from current policy/ownership, never retained as a stale run note. */
  waitingReason(runId: string): string | null {
    const run = this.db.select().from(runs).where(eq(runs.id, runId)).get();
    if (!run || run.status !== 'queued') return null;
    if (this.stopped) return 'Agent host is stopping.';
    const pause = this.opts.queuePaused?.();
    if (pause) return pause;
    const blocked = this.opts.blockedReason?.(run.repoId);
    if (blocked) return redact(blocked, this.opts.secrets?.());
    const cwd = this.opts.cwdFor(run.repoId);
    if (!cwd) return 'Repository checkout is unavailable.';
    const resource = this.resourceKey(run.repoId, cwd);
    if (this.busyDirectories.has(resource) || this.db.select().from(executionLocks).where(eq(executionLocks.resource, resource)).get() || this.repositoryBusy(run.repoId, cwd)) return 'Waiting for the current or quarantined writer in this repository.';
    if (!executionCapacityAvailable(this.db)) return executionCapacityReason;
    if (this.active >= this.opts.maxConcurrent) return `Waiting for an agent execution slot (limit ${this.opts.maxConcurrent}).`;
    return 'Waiting for the queued job to be claimed.';
  }

  private drainNext(): void {
    if (this.stopped || this.draining || this.opts.queuePaused?.()) return;
    this.draining = true;
    try { this.drainQueue(); }
    finally { this.draining = false; }
  }

  private drainQueue(): void {
    if (this.stopped) return;
    while (this.active < this.opts.maxConcurrent && !this.stopped && executionCapacityAvailable(this.db)) {
      // Skip a busy checkout so unrelated projects can proceed, while writers to the
      // same checkout remain serialized even when they have different logical IDs.
      const index = this.queue.findIndex((q) => {
        const cwd = this.opts.cwdFor(q.input.repoId);
        return !cwd || Boolean(this.opts.blockedReason?.(q.input.repoId)) || (!this.busyDirectories.has(this.resourceKey(q.input.repoId, cwd)) && !this.db.select().from(executionLocks).where(eq(executionLocks.resource, this.resourceKey(q.input.repoId, cwd))).get() && !this.repositoryBusy(q.input.repoId, cwd));
      });
      if (index < 0) return;
      const [next] = this.queue.splice(index, 1);
      const blocked = this.opts.blockedReason?.(next.input.repoId);
      if (blocked) {
        this.failRun(next.id, next.input, null, blocked);
        continue;
      }
      const cwd = this.opts.cwdFor(next.input.repoId);
      if (!cwd) {
        // Repo left the allow-list while queued — fail it honestly and keep draining
        // (the old code dropped it silently AND stopped pulling the rest of the queue).
        this.failRun(next.id, next.input, null, 'repo left the allow-list before it could run');
        continue;
      }
      try { this.assertTaskCanRun(next.id, next.input.repoId, cwd); }
      catch (error) { this.failRun(next.id, next.input, null, (error as Error).message); continue; }
      let claimed: boolean;
      try {
        claimed = this.bus.commit((tx) => {
        if (!executionCapacityAvailable(this.db)) return false;
        if (tx.select().from(executionLocks).where(eq(executionLocks.resource, this.resourceKey(next.input.repoId, cwd))).get()) return false;
        if (this.repositoryBusy(next.input.repoId, cwd)) return false;
        let sourceGitIdentity: string | undefined;
        try { sourceGitIdentity = commonGitIdentity(cwd); } catch { /* synthetic adapters may have no Git checkout */ }
        const updated = tx.update(runs).set({ status: 'running', sourceGitIdentity }).where(and(eq(runs.id, next.id), eq(runs.status, 'queued'))).run();
        if (!updated.changes) return false;
        this.taskExecutions.validate(next.id);
        tx.insert(executionLocks).values({ resource: this.resourceKey(next.input.repoId, cwd), runId: next.id, owner: this.owner, acquiredTs: new Date().toISOString() }).run();
        this.taskExecutions.transition(next.id, 'running');
        return true;
        }, (claimed) => claimed ? [this.buildEvent(next.id, next.input, 'running', Date.now())] : []);
      } catch (error) {
        this.queue.unshift(next);
        this.log(`runner: claim deferred; accepted job retained: ${(error as Error).message}`);
        return;
      }
      if (!claimed) {
        this.queue.push(next);
        return;
      }
      const job = this.run(next.id, next.input, cwd);
      this.jobs.add(job);
      void job.finally(() => this.jobs.delete(job));
    }
  }

  resourceKey(repoId: string, cwd: string): string {
    const remote = this.bus.snapshot().state.repos[repoId]?.githubFullName;
    if (remote) return `github:${remote.toLowerCase()}`;
    const path = resolve(cwd);
    return process.platform === 'win32' ? path.toLowerCase() : path;
  }

  /** Preserve legacy keys; registration is not required for physical Git ownership. */
  private repositoryBusy(repoId: string, cwd: string) {
    if (verificationBlocks(this.db, repoId, cwd, this.resourceKey(repoId, cwd))) return true;
    const path = process.platform === 'win32' ? resolve(cwd).toLowerCase() : resolve(cwd);
    const all = this.db.select().from(portfolioCheckouts).all();
    const checkout = all.find((c) => c.sourceId === repoId || c.canonicalPath === path);
    let actualIdentity: string | undefined;
    try { actualIdentity = commonGitIdentity(cwd); } catch { /* registered unknown scope remains conservative below */ }
    // Synthetic/non-Git adapters still use their canonical directory resource.
    // Production worktree preparation refuses a checkout without a Git baseline.
    if (!checkout && !actualIdentity) return false;
    const siblings = checkout ? all.filter((c) => c.repositoryId === checkout.repositoryId) : [];
    for (const lock of this.db.select().from(executionLocks).all()) {
      const binding = this.taskExecutions.get(lock.runId);
      if (binding && siblings.some((c) => c.id === binding.checkoutId)) return true;
      const owner = this.db.select().from(runs).where(eq(runs.id, lock.runId)).get();
      if (!owner || owner.repoId === repoId) return true;
      if (siblings.some((c) => c.sourceId === owner.repoId || c.canonicalPath === lock.resource)) return true;
      if (owner.sourceGitIdentity) {
        if (!actualIdentity || actualIdentity === owner.sourceGitIdentity || siblings.some((c) => c.gitIdentity === owner.sourceGitIdentity)) return true;
      }
      const ownerPath = owner.workspacePath ?? this.opts.cwdFor(owner.repoId) ?? this.bus.snapshot().state.repos[owner.repoId]?.localPath ?? (isAbsolute(lock.resource) ? lock.resource : undefined);
      if (!ownerPath) return true;
      try {
        const ownerIdentity = commonGitIdentity(ownerPath);
        if (!actualIdentity || actualIdentity === ownerIdentity || siblings.some((c) => c.gitIdentity === ownerIdentity)) return true;
      }
      catch { return true; } // Cannot prove the old writer owns a different repository.
    }
    return false;
  }

  private assertTaskCanRun(runId: string, sourceId: string, cwd: string) {
    const provenance = this.db.select().from(runs).where(eq(runs.id, runId)).get();
    const sourceIdentity = provenance?.sourceGitIdentity;
    if (sourceIdentity && commonGitIdentity(cwd) !== sourceIdentity) throw new Error('Source repository identity changed after claim');
    if (provenance?.workspacePath) assertWorkspaceIdentity(provenance.workspacePath, provenance.workspaceGitIdentity);
    const binding = this.taskExecutions.validate(runId);
    if (!binding) return;
    if (!this.opts.assertCheckout || !this.opts.workspaceRoot) throw new Error('Task execution boundary is unavailable');
    this.opts.assertCheckout(binding.checkoutId, sourceId, cwd);
  }

  /** Mark a run failed end-to-end (DB + build + agent). Best-effort; never throws. */
  private failRun(runId: string, input: DispatchInput, startedMs: number | null, reason: string, outcomeUnknown = false): void {
    try {
      const changed = this.bus.commit((tx) => {
        const current = tx.select().from(runs).where(eq(runs.id, runId)).get();
        if (!current || ['done', 'failed'].includes(current.status)) return false;
        tx
        .update(runs)
        .set({
          status: 'failed',
          endedTs: new Date().toISOString(),
          durationMs: startedMs ? Date.now() - startedMs : null,
          note: redact(reason, this.opts.secrets?.()).slice(0, 200),
          diagnostics: this.handles.get(runId)?.diagnostics ? redact(this.handles.get(runId)!.diagnostics!(), this.opts.secrets?.()).slice(-4000) : null,
          processTermination: this.handles.get(runId)?.terminationConfirmed?.() ? 'confirmed' : outcomeUnknown || this.unconfirmedProcesses.has(runId) ? 'unconfirmed' : undefined,
        })
        .where(eq(runs.id, runId))
        .run();
        this.taskExecutions.transition(runId, 'failed');
        return true;
      }, (changed) => changed ? [this.buildEvent(runId, input, 'failed', startedMs), {
        id: `agent-evt:${runId}:fail:${Date.now()}`,
        type: 'agent.upserted',
        ts: new Date().toISOString(),
        source: { kind: 'runner', ref: runId },
        payload: { agent: { id: runId, name: this.agentName(input), icon: 'code', tone: 'danger', kind: 'runner', status: 'failed', statusLine: 'Failed', pct: null } },
      }] : []);
      if (!changed) return;
    } catch (error) {
      this.log(`runner: ${runId} terminal state could not be persisted: ${(error as Error).message}`);
      return;
    }
    try { this.opts.onRunDone?.(runId, { repoId: input.repoId, ok: false, resultText: null }); } catch { /* hook must never break the runner */ }
  }

  private async run(runId: string, input: DispatchInput, cwd: string): Promise<void> {
    this.active++;
    this.activeRuns.add(runId);
    const resource = this.db.select().from(executionLocks).where(eq(executionLocks.runId, runId)).get()?.resource ?? this.resourceKey(input.repoId, cwd);
    this.busyDirectories.add(resource);
    const startedMs = Date.now();
    // The whole run is wrapped so ANY throw (spawn, DB write, a zod-invalid publish,
    // handle.done rejecting) still marks the run failed AND releases the capacity slot.
    // The durable writer lock is retained if process completion was not observed. Before,
    // active-- lived past the last await with no catch: one throw leaked a slot forever
    // (and surfaced as an unhandledRejection), eventually wedging the runner.
    try {
      const taskId = this.taskExecutions.get(runId)?.taskId;
      if (taskId) await new TaskReviewStore(this.db).recheckDependencies(taskId);
      this.assertTaskCanRun(runId, input.repoId, cwd);
      const workspace = this.opts.workspaceRoot ? await prepareWorkspace(this.opts.workspaceRoot, cwd, this.taskExecutions.get(runId)?.baseSha) : null;
      if (workspace) this.db.update(runs).set({ workspacePath: workspace.path, workspaceKind: workspace.kind, workspaceGitIdentity: workspace.gitIdentity, baseSha: workspace.baseSha, branch: workspace.branch }).where(eq(runs.id, runId)).run();
      if (this.stopped || this.killed.has(runId) || this.opts.blockedReason?.(input.repoId)) throw new Error('Run cancelled before process start');
      if (taskId) await new TaskReviewStore(this.db).recheckDependencies(taskId);
      this.assertTaskCanRun(runId, input.repoId, cwd);
      await this.runBody(runId, input, workspace?.path ?? cwd, startedMs, workspace?.baseSha, cwd);
    } catch (err) {
      this.log(`runner: ${runId} crashed: ${(err as Error).message}`);
      const reason = this.unconfirmedProcesses.has(runId)
        ? `process outcome unknown; writer lock retained: ${(err as Error).message}`
        : (err as Error).message;
      this.failRun(runId, input, startedMs, reason);
    } finally {
      this.killed.delete(runId);
      this.handles.delete(runId);
      this.activeRuns.delete(runId);
      try {
        const persisted = this.db.select({ status: runs.status }).from(runs).where(eq(runs.id, runId)).get();
        if (!this.unconfirmedProcesses.has(runId) && persisted && ['done', 'failed'].includes(persisted.status)) {
          this.db.delete(executionLocks).where(and(eq(executionLocks.runId, runId), eq(executionLocks.owner, this.owner))).run();
        }
      } catch (error) { this.log(`runner: ${runId} writer lock retained after storage failure: ${(error as Error).message}`); }
      this.unconfirmedProcesses.delete(runId);
      this.busyDirectories.delete(resource);
      this.active--;
      this.drainNext();
    }
  }

  private async runBody(runId: string, input: DispatchInput, cwd: string, startedMs: number, baseSha?: string, originalCwd = cwd): Promise<void> {
    const agentId = runId;
    let turns: number | null = null;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    let resultText: string | null = null;
    let resultFailed = false;
    let timedOut = false;
    let opaque = false;
    let statusLine = 'Starting…';

    const agentEvent = (status: 'running' | 'done' | 'failed', pct: number | null) =>
      ({
        id: `agent-evt:${agentId}:${randomUUID()}`,
        type: 'agent.upserted',
        ts: new Date().toISOString(),
        source: { kind: 'runner', ref: runId },
        payload: { agent: { id: agentId, name: this.agentName(input), icon: 'code', tone: 'violet', kind: 'runner', status, statusLine, pct } },
      });
    const upsertAgent = (status: 'running' | 'done' | 'failed', pct: number | null) => this.bus.publish(agentEvent(status, pct));

    const providerPrompt = this.taskExecutions.providerPrompt(runId) ?? input.task;
    this.record(runId, 'status', 'Process launch requested');
    this.emitActivity(`act:${runId}:start`, input.repoId, `Agent dispatched: ${input.task}`, 'violet', 'agents');
    upsertAgent('running', null);

    // An adapter can create a process and then throw before returning its handle.
    // Capacity may be released on failure; repository ownership may not.
    this.unconfirmedProcesses.add(runId);
    let handle: SpawnHandle;
    try {
      handle = this.spawner.spawn({ cwd, prompt: providerPrompt, turnCap: this.opts.turnCap, model: input.model, provider: input.provider, receiptRoot: this.opts.receiptRoot, secrets: this.opts.secrets?.(),
        onProcessIdentity: (identity) => {
          this.assertTaskCanRun(runId, input.repoId, originalCwd);
          const saved = this.db.update(runs).set({ processIdentity: JSON.stringify(identity), processTermination: 'unconfirmed' })
            .where(and(eq(runs.id, runId), eq(runs.status, 'running'))).run();
          if (saved.changes !== 1) throw new Error('Process identity could not be recorded');
          return !this.stopped && !this.killed.has(runId) && !this.opts.blockedReason?.(input.repoId);
        },
      });
    } catch (error) {
      if (error instanceof ProcessNotStartedError) this.unconfirmedProcesses.delete(runId);
      throw error;
    }
    this.handles.set(runId, handle);
    const processDone = handle.done.then((code) => {
      this.unconfirmedProcesses.delete(runId);
      return code;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      this.log(`runner: ${runId} exceeded ${this.opts.timeoutMs}ms — killing`);
      handle.kill();
    }, this.opts.timeoutMs);
    timeout.unref();

    const secrets = this.opts.secrets?.();
    const normalized = async function* (): AsyncIterable<AgentUpdate> {
      if (handle.updates) { yield* handle.updates; return; }
      for await (const line of handle.lines) yield* parseStreamLine(line, secrets);
    };
    const consume = async () => {
      for await (const u of normalized()) {
        {
          if (u.kind === 'opaque') {
            opaque = true;
            statusLine = 'running (opaque)';
            upsertAgent('running', null); // no guessed % — the adapter fallback
          } else if (u.kind === 'started') {
            statusLine = 'Working…';
            this.record(runId, 'status', 'Agent started');
            upsertAgent('running', null);
          } else if (u.kind === 'tool') {
            const name = redact(u.name, this.opts.secrets?.()).slice(0, 80);
            statusLine = `Using ${name}…`;
            this.record(runId, 'tool', name);
            upsertAgent('running', null);
          } else if (u.kind === 'progress') {
            statusLine = redact(u.text, this.opts.secrets?.()).slice(0, 80);
            this.record(runId, 'progress', u.text);
            upsertAgent('running', null);
          } else if (u.kind === 'done') {
            resultFailed ||= !u.ok;
            tokensIn = u.tokensIn;
            tokensOut = u.tokensOut;
            turns = u.turns;
            resultText = u.resultText ? redact(u.resultText, this.opts.secrets?.()).slice(0, 4000) : null;
          }
        }
      }
    };
    let exitCode: number;
    try {
      // Both promises are observed immediately. EOF is not process exit: retain the
      // timeout and stop handle until the process and stream have both settled.
      [exitCode] = await Promise.all([processDone, consume()]);
    } catch (error) {
      try { handle.kill(); }
      catch (stopError) { this.log(`runner: ${runId} stop request failed: ${(stopError as Error).message}`); }
      await processDone.catch(() => -1);
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (baseSha) {
      const evidence = await workspaceEvidence(cwd, baseSha, this.db.select().from(runs).where(eq(runs.id, runId)).get()?.workspaceGitIdentity);
      this.db.update(runs).set(evidence).where(eq(runs.id, runId)).run();
    }
    const wasKilled = this.killed.has(runId);
    const ok = exitCode === 0 && !resultFailed && !timedOut && !wasKilled;
    statusLine = timedOut ? 'Timed out' : wasKilled ? 'Killed' : ok ? 'Process completed · verification pending' : 'Failed';
    this.record(runId, 'status', statusLine);

    this.bus.commit((tx) => { tx
      .update(runs)
      .set({
        status: ok ? 'done' : 'failed',
        endedTs: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        tokensIn,
        tokensOut,
        turns,
        exitCode,
        processTermination: handle.terminationConfirmed?.() ? 'confirmed' : null,
        note: timedOut ? 'wall-clock timeout' : wasKilled ? 'killed from the dashboard' : resultFailed ? 'agent reported an error' : opaque ? 'opaque stream' : null,
        resultText: resultText ? redact(resultText, this.opts.secrets?.()) : null,
        diagnostics: handle.diagnostics ? redact(handle.diagnostics(), this.opts.secrets?.()).slice(-4000) : null,
      })
      .where(eq(runs.id, runId))
      .run();
      this.taskExecutions.transition(runId, ok ? 'done' : 'failed');
    }, [this.buildEvent(runId, input, ok ? 'success' : 'failed', startedMs), agentEvent(ok ? 'done' : 'failed', ok ? 100 : null)]);

    this.emitActivity(`act:${runId}:end`, input.repoId, ok ? `Agent process completed (unverified): ${input.task}` : `Task failed: ${input.task}`, ok ? 'success' : 'danger', ok ? 'check' : 'bell');
    // Tag the repo with the agent IDS that touched it (avatar stack) via enrichment.
    // Must be runIds, not the display name: state.agents is keyed by agentId (===runId),
    // so the project page's `state.agents[aid]` and the avatar stack only resolve for a
    // runId. The human-readable label lives on the agent record itself. repo.enriched
    // replaces `agents`, so union with the prior ids (newest first, deduped, capped).
    const prevAgents = this.bus.snapshot().state.repos[input.repoId]?.agents ?? [];
    const agents = [runId, ...prevAgents.filter((a) => a !== runId)].slice(0, REPO_AGENT_CAP);
    this.bus.publish({
      id: `agent-touch:${input.repoId}:${runId}`,
      type: 'repo.enriched',
      ts: new Date().toISOString(),
      source: { kind: 'runner', ref: runId },
      payload: { repoId: input.repoId, patch: { agents } },
    });

    try { this.opts.onRunDone?.(runId, { repoId: input.repoId, ok, resultText }); } catch { /* hook must never break the runner */ }
  }

  private agentName(input: DispatchInput): string {
    return `Agent · ${input.repoId}`;
  }

  private emitActivity(id: string, repoId: string, detail: string, tone: string, icon: string): void {
    this.bus.publish({
      id,
      type: 'activity.appended',
      ts: new Date().toISOString(),
      source: { kind: 'runner', ref: repoId },
      payload: { item: { id, icon, tone, title: repoId, detail, ts: new Date().toISOString(), repoId } },
    });
  }

  private buildEvent(runId: string, input: DispatchInput, state: 'queued' | 'running' | 'success' | 'failed', startedMs: number | null) {
    return {
      id: `build-evt:${runId}:${state}`,
      type: 'build.updated',
      ts: new Date().toISOString(),
      source: { kind: 'runner', ref: runId },
      payload: {
        build: {
          id: runId,
          repo: input.repoId,
          jobLabel: input.task.slice(0, 48),
          branch: 'agent',
          kind: 'agent',
          state,
          startedTs: startedMs ? new Date(startedMs).toISOString() : null,
          elapsedSec: startedMs ? Math.round((Date.now() - startedMs) / 1000) : null,
        },
      },
    };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const id of this.activeRuns) this.killed.add(id);
    for (const q of this.queue.splice(0)) {
      // Versioned queue acceptance is durable intent; shutdown is not cancellation.
      const pending = this.db.select().from(runs).where(eq(runs.id, q.id)).get();
      if (pending?.engineVersion !== 1) this.failRun(q.id, q.input, null, 'cancelled before start: server stopping');
    }
    for (const [id, handle] of this.handles) {
      this.killed.add(id);
      handle.kill();
    }
    await Promise.allSettled([...this.jobs]);
  }
}
