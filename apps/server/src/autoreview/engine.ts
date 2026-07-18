/**
 * AutoReviewEngine — the safe orchestrator: decide WHAT to review and WHEN, publish honest
 * lifecycle events, and never let a review break anything else.
 *
 * Safety properties (the contract, enforced here):
 * - READ-ONLY: the engine only ever reads git via the differ; it never writes to a repo.
 *   Fixing a finding is a separate confirmed dispatch (the /api/reviews fix endpoint).
 * - Allow-listed: cwd comes exclusively from the scanner allow-list — an unknown repoId is a
 *   hard refusal, same rule as the runner.
 * - Honest degraded state: no Anthropic key → a manual run returns a clear error and an auto
 *   run SKIPS silently (no failed-row spam every poll). No heuristic ever invents findings.
 * - Bounded: one in-flight review per repo (single-flight), a per-repo min interval for auto
 *   triggers, capped diff, capped findings, capped ring in state.
 * - Never throws out of the async path: every failure lands as a status:'failed' row.
 */
import { randomUUID } from 'node:crypto';
import type { AutoReview, ReviewTrigger } from '@ado/shared';
import type { Bus } from '../bus';
import { collectDiff, headSha, type DiffResult } from './differ';
import { NoKeyError, type ClaudeReviewer } from './reviewer';
import type { AutoReviewStore } from './store';

/** Auto (commit-triggered) reviews per repo are at most one per this window. */
export const MIN_AUTO_INTERVAL_MS = 10 * 60 * 1000;

export interface EngineDeps {
  bus: Bus;
  store: AutoReviewStore;
  reviewer: Pick<ClaudeReviewer, 'review' | 'hasKey'>;
  cwdFor: (repoId: string) => string | null;
  /** Display name for prompts/notifications; falls back to the id. */
  repoName?: (repoId: string) => string;
  /** Called when a finished review needs attention (verdict !== clean). repoId lets the
   *  caller honor the per-project notifications switch. */
  notify?: (repoId: string, repoLabel: string, verdict: 'attention' | 'block', counts: { major: number; critical: number }) => void;
  log?: (msg: string) => void;
  now?: () => number;
  /** Injectable for tests. */
  collect?: (cwd: string) => Promise<DiffResult>;
  head?: (cwd: string) => Promise<string | null>;
}

export class AutoReviewEngine {
  private inFlight = new Set<string>();
  private deps: Required<Pick<EngineDeps, 'log' | 'now' | 'collect' | 'head' | 'repoName'>> & EngineDeps;

  constructor(deps: EngineDeps) {
    this.deps = {
      ...deps,
      log: deps.log ?? (() => {}),
      now: deps.now ?? (() => Date.now()),
      collect: deps.collect ?? collectDiff,
      head: deps.head ?? headSha,
      repoName: deps.repoName ?? ((id) => id),
    };
  }

  /** Enable/disable auto-review for a repo. Enabling seeds the baseline to the CURRENT head
   *  so only commits made AFTER enabling get auto-reviewed (no surprise review of old work). */
  async setEnabled(repoId: string, enabled: boolean): Promise<{ repoId: string; enabled: boolean; lastSha: string | null }> {
    const cwd = this.deps.cwdFor(repoId);
    if (!cwd) throw new Error(`repo '${repoId}' is not in the scanner allow-list`);
    const baseline = enabled ? await this.deps.head(cwd) : null;
    const s = this.deps.store.setEnabled(repoId, enabled, baseline);
    this.deps.log(`autoreview: ${repoId} ${enabled ? `enabled (baseline ${baseline?.slice(0, 7) ?? 'none'})` : 'disabled'}`);
    return { repoId, enabled: s.enabled, lastSha: s.lastSha };
  }

  /**
   * Start a review now. Returns the running row, or an error string (manual callers surface it
   * as a 4xx — the engine never fabricates a result it can't produce).
   */
  runNow(repoId: string, trigger: ReviewTrigger): { review: AutoReview } | { error: string } {
    const cwd = this.deps.cwdFor(repoId);
    if (!cwd) return { error: `repo '${repoId}' is not in the scanner allow-list — only scanned repos can be reviewed` };
    if (!this.deps.reviewer.hasKey()) return { error: 'no Anthropic key connected — connect one in Settings to enable Auto-Review' };
    if (this.inFlight.has(repoId)) return { error: `a review of '${repoId}' is already running` };

    this.inFlight.add(repoId);
    const review: AutoReview = {
      id: randomUUID(),
      repoId,
      ts: new Date(this.deps.now()).toISOString(),
      trigger,
      ref: 'pending',
      refLabel: 'collecting diff…',
      model: '',
      status: 'running',
      findings: [],
    };
    this.publish(review, 'running');
    void this.execute(review, cwd).finally(() => this.inFlight.delete(repoId));
    return { review };
  }

  /** Poll enabled repos for a new HEAD; review new commits (throttled). Scheduler-driven. */
  async checkForCommits(): Promise<void> {
    for (const repoId of this.deps.store.enabledRepoIds()) {
      try {
        const cwd = this.deps.cwdFor(repoId);
        if (!cwd) continue; // repo folder gone — the scanner prune will clean settings up
        const s = this.deps.store.settings(repoId);
        const sha = await this.deps.head(cwd);
        if (!sha || sha === s.lastSha) continue; // no commits / nothing new
        const lastAuto = s.lastAutoTs ? Date.parse(s.lastAutoTs) : 0;
        if (this.deps.now() - lastAuto < MIN_AUTO_INTERVAL_MS) continue; // throttled — next poll catches it
        if (!this.deps.reviewer.hasKey()) continue; // honest skip: no key → no auto rows, no spam
        const started = this.runNow(repoId, 'commit');
        if ('error' in started) this.deps.log(`autoreview: auto-skip ${repoId}: ${started.error}`);
      } catch (err) {
        this.deps.log(`autoreview: poll failed for ${repoId}: ${(err as Error).message}`);
      }
    }
  }

  private async execute(review: AutoReview, cwd: string): Promise<void> {
    try {
      const collected = await this.deps.collect(cwd);
      if ('error' in collected) {
        this.publish({ ...review, ts: this.nowIso(), status: 'failed', error: collected.error }, 'failed');
        return;
      }
      const withRef: AutoReview = {
        ...review,
        ref: collected.ref,
        refLabel: collected.refLabel,
        stats: collected.stats,
      };
      const repoName = this.deps.repoName(review.repoId);
      const out = await this.deps.reviewer.review({
        repoName,
        branch: collected.branch,
        refLabel: collected.refLabel,
        diff: collected.diff,
        truncated: collected.truncated,
      });
      const done: AutoReview = {
        ...withRef,
        ts: this.nowIso(),
        model: out.model,
        status: 'done',
        verdict: out.verdict,
        summary: out.summary,
        findings: out.findings,
      };
      this.publish(done, 'done');

      // Auto-reviewed a commit → advance the baseline so the poll doesn't re-review it.
      if (collected.ref !== 'working-tree') {
        this.deps.store.markReviewed(review.repoId, collected.ref, this.nowIso());
      }
      if (out.verdict !== 'clean' && this.deps.notify) {
        const major = out.findings.filter((f) => f.severity === 'major').length;
        const critical = out.findings.filter((f) => f.severity === 'critical').length;
        this.deps.notify(review.repoId, repoName, out.verdict, { major, critical });
      }
      this.deps.log(`autoreview: ${review.repoId} ${out.verdict} (${out.findings.length} finding(s)) for ${collected.refLabel}`);
    } catch (err) {
      // NoKeyError can only race in here if the key was removed mid-run — still an honest fail.
      const msg = err instanceof NoKeyError ? err.message : `review failed: ${(err as Error).message}`;
      this.publish({ ...review, ts: this.nowIso(), status: 'failed', error: msg }, 'failed');
      this.deps.log(`autoreview: ${review.repoId} failed: ${msg}`);
    }
  }

  /** Publish a lifecycle row. Event id is unique per (review, phase) so the bus dedup never
   *  swallows a legitimate update, while a crash-replay of the same phase stays idempotent. */
  private publish(review: AutoReview, phase: 'running' | 'done' | 'failed'): void {
    this.deps.bus.publish({
      id: `autoreview:${review.id}:${phase}`,
      type: 'autoreview.updated',
      ts: review.ts,
      source: { kind: 'app', ref: review.id },
      payload: { review },
    });
  }

  private nowIso(): string {
    return new Date(this.deps.now()).toISOString();
  }
}
