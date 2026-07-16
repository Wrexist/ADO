/**
 * Automation engine — turns a saved automation into a real dispatched agent run. Fired three
 * ways: on command (runNow), on a real CI event (onBuildEvent — the caller filters out the
 * runner's OWN builds so an automation can't retrigger itself), and on a schedule (tickScheduled).
 * A dispatch that can't run (repo not in the allow-list) is caught and logged, never crashes.
 */
import { eventMatches, isScheduleDue, type Automation } from '@ado/shared';
import type { AutomationStore } from './store';

export type DispatchFn = (repoId: string, task: string, model?: string) => { runId: string };

const DEBOUNCE_MS = 2 * 60 * 1000; // don't refire the same automation within 2 min

export class AutomationEngine {
  constructor(
    private store: AutomationStore,
    private dispatch: DispatchFn,
    private log: (msg: string) => void = () => {},
    private now: () => number = () => Date.now(),
    /** Per-project switch (project settings → "Automations"). Manual runNow ignores it —
     *  a deliberate click outranks the background switch; schedules/events honor it. */
    private isRepoEnabled: (repoId: string) => boolean = () => true,
  ) {}

  /** Run one automation now (manual). Returns the runId, or throws (unknown / not dispatchable). */
  runNow(id: string): { runId: string } {
    const a = this.store.get(id);
    if (!a) throw new Error('unknown automation');
    return this.fire(a);
  }

  private fire(a: Automation): { runId: string } {
    const { runId } = this.dispatch(a.repoId, a.task, a.model);
    this.store.markRun(a.id, runId, new Date(this.now()).toISOString());
    this.log(`automation "${a.name}" (${a.repoId}) → ${runId}`);
    return { runId };
  }

  private tryFire(a: Automation): void {
    if (this.tooSoon(a)) return;
    try {
      this.fire(a);
    } catch (err) {
      this.log(`automation "${a.name}" skipped: ${(err as Error).message}`);
    }
  }

  private tooSoon(a: Automation): boolean {
    if (!a.lastRunTs) return false;
    const last = Date.parse(a.lastRunTs);
    return Number.isFinite(last) && this.now() - last < DEBOUNCE_MS;
  }

  /** A real CI/scan build event arrived for a repo (caller must exclude runner-origin builds). */
  onBuildEvent(repoId: string, eventName: 'build.failed' | 'build.success'): void {
    if (!this.isRepoEnabled(repoId)) return; // project switch off → background triggers sleep
    for (const a of this.store.listForRepo(repoId)) {
      if (a.enabled && eventMatches(a.trigger, eventName)) this.tryFire(a);
    }
  }

  /** Scheduler tick — fire every enabled scheduled automation that's due. */
  tickScheduled(): void {
    const nowMs = this.now();
    for (const a of this.store.list()) {
      if (!a.enabled) continue;
      if (!this.isRepoEnabled(a.repoId)) continue; // project switch off → skip quietly
      const last = a.lastRunTs ? Date.parse(a.lastRunTs) : NaN;
      if (isScheduleDue(a.trigger, Number.isFinite(last) ? last : null, nowMs)) this.tryFire(a);
    }
  }
}
