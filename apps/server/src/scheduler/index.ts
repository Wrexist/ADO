/**
 * Catch-up scheduler (convention 13). Recurring jobs register here instead of holding
 * their own naked setInterval. The last run of each job is persisted to the `jobs` table,
 * so on boot an overdue job fires immediately — a laptop asleep past a nightly backup
 * still gets one when it wakes, instead of silently skipping until the next tick.
 *
 * Design notes:
 * - Time is injectable (`now`) so tests can prove catch-up without waiting real hours.
 * - A job that throws does NOT update its last-run, so it retries next tick / next boot
 *   rather than being marked done — but it never crashes the scheduler.
 * - Timers are unref'd: a pending backup timer never keeps the process alive on its own.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { jobs } from '../db/schema';

export interface Job {
  name: string;
  intervalMs: number;
  run: () => void | Promise<void>;
  /** Fire on every boot regardless of overdue (e.g. cheap rollups). Default: only if overdue. */
  runOnBoot?: boolean;
}

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private registered: Job[] = [];
  private stopped = false;

  constructor(
    private db: Db,
    private log: (msg: string) => void = () => {},
    private now: () => number = () => Date.now(),
  ) {}

  register(job: Job): void {
    this.registered.push(job);
  }

  /** Epoch ms of the job's last successful run, or null if it never ran. */
  lastRun(name: string): number | null {
    const row = this.db.select().from(jobs).where(eq(jobs.name, name)).get();
    if (!row?.lastRunTs) return null;
    const t = Date.parse(row.lastRunTs);
    return Number.isFinite(t) ? t : null;
  }

  private markRun(name: string, atMs: number): void {
    const iso = new Date(atMs).toISOString();
    this.db
      .insert(jobs)
      .values({ name, lastRunTs: iso })
      .onConflictDoUpdate({ target: jobs.name, set: { lastRunTs: iso } })
      .run();
  }

  private async fire(job: Job): Promise<void> {
    if (this.stopped) return;
    const started = this.now();
    try {
      await job.run();
      this.markRun(job.name, started); // only a clean run advances the clock
    } catch (e) {
      this.log(`scheduler: job '${job.name}' failed, will retry: ${(e as Error).message}`);
    }
  }

  /** True if the job is due now (never ran, or intervalMs elapsed since last run). */
  isDue(job: Job): boolean {
    const last = this.lastRun(job.name);
    return last == null || this.now() - last >= job.intervalMs;
  }

  start(): void {
    this.stopped = false;
    for (const job of this.registered) {
      if (job.runOnBoot || this.isDue(job)) void this.fire(job); // catch-up
      const timer = setInterval(() => void this.fire(job), job.intervalMs);
      timer.unref?.(); // a scheduled job must not, by itself, keep the process alive
      this.timers.set(job.name, timer);
    }
  }

  /** Run a registered job now, off-schedule (manual trigger / tests). */
  async runNow(name: string): Promise<void> {
    const job = this.registered.find((j) => j.name === name);
    if (job) await this.fire(job);
  }

  stop(): void {
    this.stopped = true;
    for (const t of this.timers.values()) clearInterval(t);
    this.timers.clear();
  }
}
