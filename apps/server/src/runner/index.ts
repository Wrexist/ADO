/**
 * Runner (Prompts 3.1–3.2): dispatch headless `claude -p` agents, stream their progress
 * as typed bus events, and log every run.
 *
 * Safety rails (council B4): a dispatch semaphore (max N concurrent) backs the Build
 * Queue — excess dispatches are `queued`, not spawned; each run has a wall-clock timeout;
 * spawns get a turn cap + minimal env (in the Spawner). Registry survives restart: a
 * `running` row on boot is an orphan, reconciled to `failed`.
 */
import { eq, inArray } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db';
import { runs } from '../db/schema';
import { parseStreamLine } from './adapter';
import type { Spawner, SpawnHandle } from './spawner';

export interface DispatchInput {
  repoId: string;
  task: string;
  model?: string;
}

interface RunnerOpts {
  maxConcurrent?: number;
  turnCap?: number;
  timeoutMs?: number;
  /** repoId → absolute cwd (the allow-list; a dispatch outside it is rejected). */
  cwdFor: (repoId: string) => string | null;
}

const DEFAULTS = { maxConcurrent: 3, turnCap: 20, timeoutMs: 15 * 60_000 };

export class Runner {
  private active = 0;
  private seq = 0; // guarantees unique run ids even for same-millisecond dispatches
  private queue: Array<{ id: string; input: DispatchInput }> = [];
  private handles = new Map<string, SpawnHandle>();
  private opts: Required<Omit<RunnerOpts, 'cwdFor'>> & Pick<RunnerOpts, 'cwdFor'>;

  constructor(
    private bus: Bus,
    private db: Db,
    private spawner: Spawner,
    opts: RunnerOpts,
    private log: (msg: string) => void = () => {},
  ) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /**
   * On boot, any run still marked running OR queued is an orphan: a `running` row's
   * process died with the previous server, and the in-memory queue that owned the
   * `queued` rows is gone — neither can ever resolve itself → failed.
   */
  reconcileOrphans(): number {
    const orphans = this.db.select().from(runs).where(inArray(runs.status, ['running', 'queued'])).all();
    for (const o of orphans) {
      this.db
        .update(runs)
        .set({ status: 'failed', endedTs: new Date().toISOString(), note: 'orphaned on boot' })
        .where(eq(runs.id, o.id))
        .run();
    }
    return orphans.length;
  }

  /** Accept a dispatch. Returns the runId, or throws if the cwd isn't allow-listed. */
  dispatch(input: DispatchInput): { runId: string } {
    const cwd = this.opts.cwdFor(input.repoId);
    if (!cwd) throw new Error(`repo '${input.repoId}' is not in the scanner allow-list`);

    const runId = `run-${input.repoId}-${Date.now()}-${++this.seq}`;
    const now = new Date().toISOString();
    this.db
      .insert(runs)
      .values({ id: runId, repoId: input.repoId, task: input.task, model: input.model ?? 'default', status: 'queued', startedTs: now })
      .run();

    // Reflect as a queued build immediately (backs the Build Queue), then let the
    // semaphore-aware drain start it now or hold it until a slot frees.
    this.emitBuild(runId, input, 'queued', null);
    this.queue.push({ id: runId, input });
    this.drainNext();
    return { runId };
  }

  /** Start queued runs up to the concurrency limit; fail any whose cwd is no longer allowed. */
  private drainNext(): void {
    while (this.active < this.opts.maxConcurrent) {
      const next = this.queue.shift();
      if (!next) return;
      const cwd = this.opts.cwdFor(next.input.repoId);
      if (!cwd) {
        // Repo left the allow-list while queued — fail it honestly and keep draining
        // (the old code dropped it silently AND stopped pulling the rest of the queue).
        this.failRun(next.id, next.input, null, 'repo left the allow-list before it could run');
        continue;
      }
      void this.run(next.id, next.input, cwd); // run() increments `active` synchronously
    }
  }

  /** Mark a run failed end-to-end (DB + build + agent). Best-effort; never throws. */
  private failRun(runId: string, input: DispatchInput, startedMs: number | null, reason: string): void {
    try {
      this.db
        .update(runs)
        .set({
          status: 'failed',
          endedTs: new Date().toISOString(),
          durationMs: startedMs ? Date.now() - startedMs : null,
          note: reason.slice(0, 200),
        })
        .where(eq(runs.id, runId))
        .run();
    } catch { /* best effort */ }
    try { this.emitBuild(runId, input, 'failed', startedMs); } catch { /* best effort */ }
    try {
      this.bus.publish({
        id: `agent-evt:${runId}:fail:${Date.now()}`,
        type: 'agent.upserted',
        ts: new Date().toISOString(),
        source: { kind: 'runner', ref: runId },
        payload: { agent: { id: runId, name: this.agentName(input), icon: 'code', tone: 'danger', kind: 'runner', status: 'failed', statusLine: 'Failed', pct: null } },
      });
    } catch { /* best effort */ }
  }

  private async run(runId: string, input: DispatchInput, cwd: string): Promise<void> {
    this.active++;
    const startedMs = Date.now();
    // The whole run is wrapped so ANY throw (spawn, DB write, a zod-invalid publish,
    // handle.done rejecting) still marks the run failed AND releases the slot. Before,
    // active-- lived past the last await with no catch: one throw leaked a slot forever
    // (and surfaced as an unhandledRejection), eventually wedging the runner.
    try {
      await this.runBody(runId, input, cwd, startedMs);
    } catch (err) {
      this.log(`runner: ${runId} crashed: ${(err as Error).message}`);
      this.failRun(runId, input, startedMs, (err as Error).message);
    } finally {
      this.active--;
      this.drainNext();
    }
  }

  private async runBody(runId: string, input: DispatchInput, cwd: string, startedMs: number): Promise<void> {
    this.db.update(runs).set({ status: 'running' }).where(eq(runs.id, runId)).run();

    const agentId = runId;
    let turns = 0;
    let tokensIn: number | null = null;
    let tokensOut: number | null = null;
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

    this.emitActivity(`act:${runId}:start`, input.repoId, `Agent dispatched: ${input.task}`, 'violet', 'agents');
    this.emitBuild(runId, input, 'running', startedMs);
    upsertAgent('running', 0);

    const handle = this.spawner.spawn({ cwd, prompt: input.task, turnCap: this.opts.turnCap, model: input.model });
    this.handles.set(runId, handle);

    const timeout = setTimeout(() => {
      this.log(`runner: ${runId} exceeded ${this.opts.timeoutMs}ms — killing`);
      handle.kill();
    }, this.opts.timeoutMs);

    try {
      for await (const line of handle.lines) {
        for (const u of parseStreamLine(line)) {
          if (u.kind === 'opaque') {
            opaque = true;
            statusLine = 'running (opaque)';
            upsertAgent('running', null); // no guessed % — the adapter fallback
          } else if (u.kind === 'started') {
            statusLine = 'Working…';
            upsertAgent('running', pct(turns, this.opts.turnCap, opaque));
          } else if (u.kind === 'tool') {
            turns++;
            statusLine = `Using ${u.name}…`;
            upsertAgent('running', pct(turns, this.opts.turnCap, opaque));
          } else if (u.kind === 'progress') {
            statusLine = u.text;
            upsertAgent('running', pct(turns, this.opts.turnCap, opaque));
          } else if (u.kind === 'done') {
            tokensIn = u.tokensIn;
            tokensOut = u.tokensOut;
            turns = u.turns ?? turns;
          }
        }
      }
    } finally {
      clearTimeout(timeout);
      this.handles.delete(runId);
    }

    const exitCode = await handle.done;
    const ok = exitCode === 0;
    statusLine = ok ? 'Completed' : 'Failed';
    upsertAgent(ok ? 'done' : 'failed', ok ? 100 : null);

    this.db
      .update(runs)
      .set({
        status: ok ? 'done' : 'failed',
        endedTs: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        tokensIn,
        tokensOut,
        turns,
        exitCode,
        note: opaque ? 'opaque stream' : null,
      })
      .where(eq(runs.id, runId))
      .run();

    this.emitBuild(runId, input, ok ? 'success' : 'failed', startedMs);
    this.emitActivity(`act:${runId}:end`, input.repoId, ok ? `Task completed: ${input.task}` : `Task failed: ${input.task}`, ok ? 'success' : 'danger', ok ? 'check' : 'bell');
    // Tag the repo with the agent that touched it (avatar stack) via enrichment.
    this.bus.publish({
      id: `agent-touch:${input.repoId}:${runId}`,
      type: 'repo.enriched',
      ts: new Date().toISOString(),
      source: { kind: 'runner', ref: runId },
      payload: { repoId: input.repoId, patch: { agents: [this.agentName(input)] } },
    });
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
      payload: { item: { id, icon, tone, title: repoId, detail, ts: new Date().toISOString() } },
    });
  }

  private emitBuild(runId: string, input: DispatchInput, state: 'queued' | 'running' | 'success' | 'failed', startedMs: number | null): void {
    this.bus.publish({
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
          state,
          startedTs: startedMs ? new Date(startedMs).toISOString() : null,
          elapsedSec: startedMs ? Math.round((Date.now() - startedMs) / 1000) : null,
        },
      },
    });
  }

  stop(): void {
    for (const h of this.handles.values()) h.kill();
  }
}

/** Progress from real turns vs the cap (documented, not invented); null when opaque. */
function pct(turns: number, cap: number, opaque: boolean): number | null {
  if (opaque) return null;
  return Math.min(95, Math.round((turns / cap) * 100));
}
