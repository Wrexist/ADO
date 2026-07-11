/**
 * System monitor (Prompt 2.4): sample real CPU / memory / network every 10s via
 * `systeminformation` and push them onto the bus. Samples are real measurements only —
 * a failed reading is skipped (the chart shows "collecting data"), never faked.
 */
import si from 'systeminformation';
import type { Bus } from '../bus';

const INTERVAL_MS = 10_000;
/** Network % is throughput relative to a documented 100 Mbps reference (rx+tx). */
const NET_REFERENCE_BYTES_SEC = 12.5e6;

const clampPct = (n: number) => Math.max(0, Math.min(100, n));

export class Sysmon {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private bus: Bus,
    private log: (msg: string) => void = () => {},
  ) {}

  private async sampleOnce(): Promise<void> {
    try {
      const [load, mem, net] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.networkStats(),
      ]);
      const cpuPct = clampPct(load.currentLoad);
      const memPct = clampPct((mem.active / mem.total) * 100);
      const iface = net[0];
      const throughput = iface ? (iface.rx_sec ?? 0) + (iface.tx_sec ?? 0) : 0;
      const netPct = clampPct((throughput / NET_REFERENCE_BYTES_SEC) * 100);
      this.bus.pushSample(cpuPct, memPct, netPct);
    } catch (err) {
      this.log(`sysmon: sample failed (${(err as Error).message}) — skipped`);
    }
  }

  start(): void {
    // networkStats needs a priming call to compute per-second deltas; discard the first.
    void si.networkStats().catch(() => undefined);
    void this.sampleOnce();
    this.timer = setInterval(() => void this.sampleOnce(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
