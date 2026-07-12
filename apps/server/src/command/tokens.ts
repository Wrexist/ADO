/**
 * Token accounting (Prompt 4.2). The honest, deterministic number: sum the tokens the
 * run logger already records for dashboard-dispatched runs over a trailing window, and
 * publish a tokens.rollup event (shown with ≈ in the UI).
 *
 * Terminal-started Claude sessions aren't captured here — that needs session-log parsing
 * through a versioned adapter (a later add). Until then the card reflects ONLY what we
 * truly measured (dispatched runs), never a guess.
 */
import { gte } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db';
import { runs } from '../db/schema';

const WINDOW_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;

export class TokenRollup {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private bus: Bus,
    private db: Db,
    private log: (msg: string) => void = () => {},
  ) {}

  /** Sum run-log tokens over the window and publish the rollup. */
  rollup(): void {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * HOUR_MS).toISOString();
    const rows = this.db.select().from(runs).where(gte(runs.startedTs, since)).all();
    let total = 0;
    let anyMeasured = false;
    for (const r of rows) {
      if (r.tokensIn != null) {
        total += r.tokensIn;
        anyMeasured = true;
      }
      if (r.tokensOut != null) {
        total += r.tokensOut;
        anyMeasured = true;
      }
    }
    this.bus.publish({
      id: `tokens:${Date.now()}`, // always fresh so the card updates as runs complete
      type: 'tokens.rollup',
      ts: new Date().toISOString(),
      source: { kind: 'tokens', ref: 'run-log' },
      // null = nothing measured yet → UI shows ≈— "unavailable", never a fake 0-as-real
      payload: { approxTokens: anyMeasured ? total : null, windowLabel: `${WINDOW_DAYS} days` },
    });
    this.log(`tokens: ${anyMeasured ? `≈${total}` : 'unavailable'} over ${WINDOW_DAYS}d`);
  }

  start(): void {
    this.rollup();
    this.timer = setInterval(() => this.rollup(), HOUR_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
