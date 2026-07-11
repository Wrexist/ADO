/**
 * Health checks (Prompt 2.4), every 60s. Only emit for services we can HONESTLY
 * check: `server` (self — operational if this loop runs) and `anthropic` (only when a
 * key is configured, via a real request). `github` is emitted by the GitHub sync;
 * `runner` stays unknown until Phase 3 → the UI shows "No data", never a fake status.
 */
import type { Bus } from '../bus';
import type { ServiceState } from '@ado/shared';

const INTERVAL_MS = 60_000;

export class HealthChecker {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private bus: Bus,
    private anthropicKey: string,
    private log: (msg: string) => void = () => {},
  ) {}

  private emit(service: 'server' | 'anthropic', state: ServiceState): void {
    this.bus.publish({
      id: `health:${service}:${Date.now()}`,
      type: 'health.checked',
      ts: new Date().toISOString(),
      source: { kind: 'health', ref: service },
      payload: { service, state },
    });
  }

  private async checkAnthropic(): Promise<void> {
    if (!this.anthropicKey) return; // no key → leave unknown (honest "No data")
    try {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': this.anthropicKey, 'anthropic-version': '2023-06-01' },
      });
      this.emit('anthropic', res.ok ? 'operational' : 'degraded');
    } catch {
      this.emit('anthropic', 'down');
    }
  }

  private tick(): void {
    this.emit('server', 'operational');
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
