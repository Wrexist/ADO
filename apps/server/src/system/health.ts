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

const INTERVAL_MS = 60_000;

export class HealthChecker {
  private timer: NodeJS.Timeout | null = null;

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
      id: `health:${service}:${Date.now()}`,
      type: 'health.checked',
      ts: new Date().toISOString(),
      source: { kind: 'health', ref: service },
      payload: { service, state },
    });
  }

  private async checkAnthropic(): Promise<void> {
    const key = this.getAnthropicKey();
    if (!key) return; // no key → leave unknown (honest "No data")
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(5000), // a hung endpoint must not pile up 60s requests
      });
      this.emit('anthropic', res.ok ? 'operational' : 'degraded');
    } catch {
      this.emit('anthropic', 'down');
    }
  }

  private tick(): void {
    this.emit('server', 'operational');
    this.emit('runner', this.getRunnerState());
    void this.checkAnthropic();
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
