/**
 * IncidentReporter — the capture side of self-diagnosis.
 *
 * `report()` publishes an `incident.reported` event, then asynchronously asks the diagnoser
 * WHY it happened and publishes `incident.diagnosed`. Both flow through the bus like any other
 * event, so the web sees them over SSE with no polling.
 *
 * Resilience: identical failures are collapsed to one incident per minute (a render loop or a
 * hot path throwing every tick must not flood the bus or the Anthropic API). Reporting a
 * failure must never itself throw — the whole method is guarded, so the reporter can be called
 * from an error handler or an `uncaughtException` hook without risk of recursion.
 */
import { randomUUID } from 'node:crypto';
import type { Incident, IncidentSource } from '@ado/shared';
import type { Bus } from '../bus';
import type { IncidentDiagnoser } from './diagnoser';

export interface ReportInput {
  source: IncidentSource;
  kind: string;
  message: string;
  stack?: string;
  context?: string;
}

const THROTTLE_MS = 60_000; // collapse a repeating failure into at most one incident per minute

export class IncidentReporter {
  private lastByFingerprint = new Map<string, number>();
  private inFlight = new Set<Promise<void>>();

  constructor(
    private bus: Bus,
    private diagnoser: IncidentDiagnoser,
    private log: (msg: string) => void = () => {},
    /** Injectable clock so the throttle is deterministic in tests. */
    private now: () => number = () => Date.now(),
  ) {}

  /**
   * Capture a failure. Returns the Incident, or null if it was throttled (a repeat within the
   * window) or reporting itself failed. Kicks off diagnosis in the background; use settled() in
   * tests to await it.
   */
  report(input: ReportInput): Incident | null {
    try {
      const now = this.now();
      const fp = `${input.source}|${input.kind}|${firstLine(input.message)}`;
      const last = this.lastByFingerprint.get(fp);
      if (last != null && now - last < THROTTLE_MS) return null; // collapse a storm — honest, bounded
      this.lastByFingerprint.set(fp, now);
      this.prune(now);

      const incident: Incident = {
        id: randomUUID(),
        ts: new Date(now).toISOString(),
        source: input.source,
        kind: input.kind,
        message: input.message,
        stack: input.stack,
        context: input.context,
        status: 'open',
      };
      this.bus.publish({
        id: `incident:${incident.id}`,
        type: 'incident.reported',
        ts: incident.ts,
        source: { kind: 'app', ref: incident.id },
        payload: { incident },
      });

      const p = this.diagnoseAndPublish(incident).finally(() => this.inFlight.delete(p));
      this.inFlight.add(p);
      return incident;
    } catch (e) {
      // Reporting a failure must not become a failure — swallow and log.
      this.log(`incident reporter could not report: ${(e as Error).message}`);
      return null;
    }
  }

  /** Await all in-flight diagnoses (tests). Production never needs to block on this. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  private async diagnoseAndPublish(incident: Incident): Promise<void> {
    try {
      const diagnosis = await this.diagnoser.diagnose(incident);
      this.bus.publish({
        id: `incident-dx:${incident.id}`,
        type: 'incident.diagnosed',
        ts: new Date(this.now()).toISOString(),
        source: { kind: 'app', ref: incident.id },
        payload: { incidentId: incident.id, diagnosis },
      });
    } catch (e) {
      // A failed diagnosis leaves the incident 'open' (honest) — never crash the reporter.
      this.log(`incident diagnosis failed for ${incident.id}: ${(e as Error).message}`);
    }
  }

  private prune(now: number): void {
    for (const [fp, ts] of this.lastByFingerprint) {
      if (now - ts >= THROTTLE_MS) this.lastByFingerprint.delete(fp);
    }
  }
}

function firstLine(s: string): string {
  return (s.split('\n')[0] ?? '').trim().slice(0, 200);
}
