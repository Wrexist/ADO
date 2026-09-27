/**
 * Runner (Prompts 3.1–3.2): dispatch headless `claude -p` agents, stream their progress
 * as typed bus events, and log every run.
 *
 * Safety rails (council B4): a dispatch semaphore (max N concurrent) backs the Build
 * Queue — excess dispatches are `queued`, not spawned; each run has a wall-clock timeout;
 * spawns get a turn cap + minimal env (in the Spawner). Registry survives restart: a
 * `running` row on boot is an orphan, reconciled to `failed`.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db';
import { executionLocks, runs } from '../db/schema';
import { parseStreamLine, type AgentUpdate } from './adapter';
import type { Spawner, SpawnHandle } from './spawner';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { redact } from '../lib/redact';
import { prepareWorkspace, workspaceEvidence } from './workspace';
import { readTerminationReceipt } from '../lib/terminationReceipt';

export interface DispatchInput {
  repoId: string;
  task: string;
  model?: string;
  provider?: string;
  idempotencyKey?: string;
}

interface RunnerOpts {
  maxConcurrent?: number;
  turnCap?: number;
  timeoutMs?: number;
  defaultProvider?: 'claude' | 'codex';
  workspaceRoot?: string;
  receiptRoot?: string;
  secrets?: () => Array<string | undefined>;
  /** repoId → absolute cwd (the allow-list; a dispatch outside it is rejected). */
  cwdFor: (repoId: string) => string | null;
  /**
   * Per-project switch (project settings → "Agent dispatch"). Returning a string blocks the
   * dispatch with that reason. Checked FIRST so every dispatch path — command box, prompts,
   * automations, incident/review fixes — honors the switch through this one choke point.
   */
  blockedReason?: (repoId: string) => string | null;
  /**
   * Called once when a run finishes (success or failure) with the agent's final text (null
   * when the stream carried none). Consumers parse it for verified-outcome markers — e.g.
   * the TestFlight watcher records a deploy only from a marker. Guarded: a throwing hook
   * never breaks the runner.
   */
  onRunDone?: (runId: string, info: { repoId: string; ok: boolean; resultText: string | null }) => void;
}

const DEFAULTS = { maxConcurrent: 3, turnCap: 20, timeoutMs: 15 * 60_000 };
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

  constructor(
    private bus: Bus,
    private db: Db,
    private spawner: Spawner,
    opts: RunnerOpts,
    private log: (msg: string) => void = () => {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
    this.log = (message) => log(redact(message, this.opts.secrets?.()));
  }

  /**
   * Restore versioned queued jobs; never restart an attempt that might have spawned.
   * Legacy runs remain explicit failures. Historically: a `running` row's
   * process died with the previous server, and the in-memory queue that owned the
   * `queued` rows is gone — neither can ever resolve itself → failed.
   */
  reconcileOrphans(): number {
    const orphans = this.db.select().from(runs).where(inArray(runs.status, ['running', 'queued'])).all();
    for (const o of orphans) {
      if (o.engineVersion === 1 && o.status === 'queued') {
        if (!this.queue.some((q) => q.id === o.id)) this.queue.push({ id: o.id, input: { repoId: o.repoId, task: o.task, model: o.model === 'default' ? undefined : o.model, provider: o.provider } });
        continue;
      }
      this.failRun(o.id, { repoId: o.repoId, task: o.task, model: o.model === 'default' ? undefined : o.model, provider: o.provider }, null, o.engineVersion === 1 ? 'interrupted; previous process outcome unknown; writer lock retained' : 'orphaned on boot');
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
    if (!run || !lock || run.status !== 'failed') return false;
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
  dispatch(input: DispatchInput): { runId: string } {
    if (this.stopped) throw new Error('runner is stopping; no new dispatches accepted');
    input = { ...input, provider: input.provider ?? this.opts.defaultProvider ?? 'claude' };
    if (!['claude', 'codex'].includes(input.provider!)) throw new Error('Unsupported provider');
    const requestHash = createHash('sha256').update(JSON.stringify([input.repoId, input.task, input.model ?? 'default', input.provider])).digest('hex');
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

    const runId = `run-${input.repoId}-${Date.now()}-${++this.seq}-${randomUUID()}`;
    const now = new Date().toISOString();
    this.bus.commit((tx) => tx
      .insert(runs)
      .values({ id: runId, repoId: input.repoId, task: input.task, model: input.model ?? 'default', provider: input.provider, status: 'queued', startedTs: now, engineVersion: 1, idempotencyKey: input.idempotencyKey, requestHash })
      .run(), [this.buildEvent(runId, input, 'queued', null)]);

    // Reflect as a queued build immediately (backs the Build Queue), then let the
    // semaphore-aware drain start it now or hold it until a slot frees.
    this.record(runId, 'status', 'Queued');
    this.queue.push({ id: runId, input });
    this.drainNext();
    return { runId };
  }

  /** Start queued runs up to the concurrency limit; fail any whose cwd is no longer allowed. */
  private drainNext(): void {
    if (this.stopped || this.draining) return;
    this.draining = true;
    try { this.drainQueue(); }
    finally { this.draining = false; }
  }

  private drainQueue(): void {
    if (this.stopped) return;
    while (this.active < this.opts.maxConcurrent && !this.stopped) {
      // Skip a busy checkout so unrelated projects can proceed, while writers to the
      // same checkout remain serialized even when they have different logical IDs.
      const index = this.queue.findIndex((q) => {
        const cwd = this.opts.cwdFor(q.input.repoId);
        return !cwd || Boolean(this.opts.blockedReason?.(q.input.repoId)) || (!this.busyDirectories.has(this.resourceKey(q.input.repoId, cwd)) && !this.db.select().from(executionLocks).where(eq(executionLocks.resource, this.resourceKey(q.input.repoId, cwd))).get());
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
      let claimed: boolean;
      try {
        claimed = this.bus.commit((tx) => {
        if (tx.select().from(executionLocks).where(eq(executionLocks.resource, this.resourceKey(next.input.repoId, cwd))).get()) return false;
        const updated = tx.update(runs).set({ status: 'running' }).where(and(eq(runs.id, next.id), eq(runs.status, 'queued'))).run();
        if (!updated.changes) return false;
        tx.insert(executionLocks).values({ resource: this.resourceKey(next.input.repoId, cwd), runId: next.id, owner: this.owner, acquiredTs: new Date().toISOString() }).run();
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

  private resourceKey(repoId: string, cwd: string): string {
    const remote = this.bus.snapshot().state.repos[repoId]?.githubFullName;
    if (remote) return `github:${remote.toLowerCase()}`;
    const path = resolve(cwd);
    return process.platform === 'win32' ? path.toLowerCase() : path;
  }

  /** Mark a run failed end-to-end (DB + build + agent). Best-effort; never throws. */
  private failRun(runId: string, input: DispatchInput, startedMs: number | null, reason: string): void {
    try {
      this.bus.commit((tx) => tx
        .update(runs)
        .set({
          status: 'failed',
          endedTs: new Date().toISOString(),
          durationMs: startedMs ? Date.now() - startedMs : null,
          note: redact(reason, this.opts.secrets?.()).slice(0, 200),
          diagnostics: this.handles.get(runId)?.diagnostics ? redact(this.handles.get(runId)!.diagnostics!(), this.opts.secrets?.()).slice(-4000) : null,
          processTermination: this.handles.get(runId)?.terminationConfirmed?.() ? 'confirmed' : this.unconfirmedProcesses.has(runId) ? 'unconfirmed' : undefined,
        })
        .where(eq(runs.id, runId))
        .run(), [this.buildEvent(runId, input, 'failed', startedMs)]);
    } catch (error) {
      this.log(`runner: ${runId} terminal state could not be persisted: ${(error as Error).message}`);
      return;
    }
    try {
      this.bus.publish({
        id: `agent-evt:${runId}:fail:${Date.now()}`,
        type: 'agent.upserted',
        ts: new Date().toISOString(),
        source: { kind: 'runner', ref: runId },
        payload: { agent: { id: runId, name: this.agentName(input), icon: 'code', tone: 'danger', kind: 'runner', status: 'failed', statusLine: 'Failed', pct: null } },
      });
    } catch { /* best effort */ }
    try { this.opts.onRunDone?.(runId, { repoId: input.repoId, ok: false, resultText: null }); } catch { /* hook must never break the runner */ }
  }

  private async run(runId: string, input: DispatchInput, cwd: string): Promise<void> {
    this.active++;
    this.activeRuns.add(runId);
    this.busyDirectories.add(this.resourceKey(input.repoId, cwd));
    const startedMs = Date.now();
    // The whole run is wrapped so ANY throw (spawn, DB write, a zod-invalid publish,
    // handle.done rejecting) still marks the run failed AND releases the capacity slot.
    // The durable writer lock is retained if process completion was not observed. Before,
    // active-- lived past the last await with no catch: one throw leaked a slot forever
    // (and surfaced as an unhandledRejection), eventually wedging the runner.
    try {
      const workspace = this.opts.workspaceRoot ? await prepareWorkspace(this.opts.workspaceRoot, cwd) : null;
      if (workspace) this.db.update(runs).set({ workspacePath: workspace.path, baseSha: workspace.baseSha, branch: workspace.branch }).where(eq(runs.id, runId)).run();
      if (this.stopped || this.killed.has(runId) || this.opts.blockedReason?.(input.repoId)) throw new Error('Run cancelled before process start');
      await this.runBody(runId, input, workspace?.path ?? cwd, startedMs, workspace?.baseSha);
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
      this.busyDirectories.delete(this.resourceKey(input.repoId, cwd));
      this.active--;
      this.drainNext();
    }
  }

  private async runBody(runId: string, input: DispatchInput, cwd: string, startedMs: number, baseSha?: string): Promise<void> {
    const agentId = runId;
    let turns: number | null = null;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
    let resultText: string | null = null;
    let resultFailed = false;
    let timedOut = false;
    let opaque = false;
    let statusLine = 'Starting…';

    const upsertAgent = (status: 'running' | 'done' | 'failed', pct: number | null) =>
      this.bus.publish({
        id: `agent-evt:${agentId}:${Date.now()}:${Math.round(pct ?? -1)}`,
        type: 'agent.upserted',
        ts: new Date().toISOString(),
        source: { kind: 'runner', ref: runId },
        payload: { agent: { id: agentId, name: this.agentName(input), icon: 'code', tone: 'violet', kind: 'runner', status, statusLine, pct } },
      });

    this.record(runId, 'status', 'Spawned');
    this.emitActivity(`act:${runId}:start`, input.repoId, `Agent dispatched: ${input.task}`, 'violet', 'agents');
    upsertAgent('running', null);

    const handle = this.spawner.spawn({ cwd, prompt: input.task, turnCap: this.opts.turnCap, model: input.model, provider: input.provider, receiptRoot: this.opts.receiptRoot, secrets: this.opts.secrets?.(),
      onProcessIdentity: (identity) => {
        const saved = this.db.update(runs).set({ processIdentity: JSON.stringify(identity), processTermination: 'unconfirmed' })
          .where(and(eq(runs.id, runId), eq(runs.status, 'running'))).run();
        if (saved.changes !== 1) throw new Error('Process identity could not be recorded');
        return !this.stopped && !this.killed.has(runId) && !this.opts.blockedReason?.(input.repoId);
      },
    });
    this.handles.set(runId, handle);
    this.unconfirmedProcesses.add(runId);
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
      const evidence = await workspaceEvidence(cwd, baseSha);
      this.db.update(runs).set(evidence).where(eq(runs.id, runId)).run();
    }
    const wasKilled = this.killed.has(runId);
    const ok = exitCode === 0 && !resultFailed && !timedOut && !wasKilled;
    statusLine = timedOut ? 'Timed out' : wasKilled ? 'Killed' : ok ? 'Process completed · verification pending' : 'Failed';
    this.record(runId, 'status', statusLine);
    upsertAgent(ok ? 'done' : 'failed', ok ? 100 : null);

    this.bus.commit((tx) => tx
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
      .run(), [this.buildEvent(runId, input, ok ? 'success' : 'failed', startedMs)]);

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
      this.failRun(q.id, q.input, null, 'cancelled before start: server stopping');
    }
    for (const [id, handle] of this.handles) {
      this.killed.add(id);
      handle.kill();
    }
    await Promise.allSettled([...this.jobs]);
  }
}
