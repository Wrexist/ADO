/**
 * Health checks (Prompt 2.4), every 60s. Only emit for services we can HONESTLY
 * check: `server` (self — operational if this loop runs), `runner` (the in-process agent
 * runner — alive/ready whenever the server ticks, so operational; a callback lets it report
 * degraded), and `anthropic` (only when a key is configured, via a real request). `github`
 * is emitted by the GitHub sync. Every real service is now reported, so System Health isn't
 * silently capped by an always-unknown row.
 */
import type { Bus } from '../bus';
import type { HealthService, ServiceState } from '@ado/shared';
import { randomUUID } from 'node:crypto';

const INTERVAL_MS = 60_000;

/** Invalidation is a real event, so persisted/replayed green state is cleared too. */
export function invalidateHealth(bus: Bus, service: HealthService): void {
  bus.publish({ id: `health:${service}:${randomUUID()}`, type: 'health.checked', ts: new Date().toISOString(),
    source: { kind: 'health', ref: service }, payload: { service, state: 'unknown' } });
}

export class HealthChecker {
  private timer: NodeJS.Timeout | null = null;
  private generation = 0;
  private stopped = true;
  private pending: AbortController | null = null;

  constructor(
    private bus: Bus,
    /** Resolved per-check so a key saved in Settings takes effect on the next tick. */
    private getAnthropicKey: () => string,
    private log: (msg: string) => void = () => {},
    /** The runner's self-reported state (in-process → operational when alive). */
    private getRunnerState: () => ServiceState = () => 'operational',
  ) {}

  private emit(service: HealthService, state: ServiceState): void {
    this.bus.publish({
      id: `health:${service}:${randomUUID()}`,
      type: 'health.checked',
      ts: new Date().toISOString(),
      source: { kind: 'health', ref: service },
      payload: { service, state },
    });
  }

  private async checkAnthropic(): Promise<void> {
    const generation = ++this.generation;
    this.pending?.abort();
    const controller = new AbortController(); this.pending = controller;
    const key = this.getAnthropicKey();
    if (!key) { this.pending = null; invalidateHealth(this.bus, 'anthropic'); return; }
    const publish = (state: ServiceState) => {
      if (this.stopped || generation !== this.generation) return;
      // Also cover externally changed fallback values, not only Settings mutations.
      if (this.getAnthropicKey() !== key) invalidateHealth(this.bus, 'anthropic');
      else this.emit('anthropic', state);
    };
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      });
      await res.body?.cancel();
      publish(res.ok ? 'operational' : 'degraded');
    } catch {
      publish('down');
    } finally { if (this.pending === controller) this.pending = null; }
  }

  /** Call after a successful credential write, including re-saving identical bytes. */
  credentialsChanged(): void {
    this.generation++; this.pending?.abort(); this.pending = null;
    invalidateHealth(this.bus, 'anthropic');
  }

  private tick(): void {
    this.emit('server', 'operational');
    this.emit('runner', this.getRunnerState());
    void this.checkAnthropic();
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.credentialsChanged();
    this.tick();
    this.timer = setInterval(() => this.tick(), INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true; this.generation++; this.pending?.abort(); this.pending = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
