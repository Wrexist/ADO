/**
 * The event bus: publish → zod-validate → persist (events table) → fold into the
 * in-memory snapshot (shared reducer) → broadcast to SSE subscribers.
 *
 * State is a pure fold over the events table: on boot we replay the log, so the
 * snapshot served to new SSE clients is always consistent with history, and
 * Last-Event-ID replay comes straight from the same table (council S5).
 */
import { asc, gt, lt } from 'drizzle-orm';
import { parseEvent, type AccEvent, emptyState, reduce, type BusState, type Sample } from '@ado/shared';
import type { Db } from './db';
import { events, samples } from './db/schema';

/**
 * Outbound SSE frames. Durable events carry a monotonic seq (the Last-Event-ID
 * checkpoint); transient sysmon samples ride their own channel with NO id, so they
 * never bloat the event log or move the replay cursor — they live in the `samples`
 * table and are re-seeded via the snapshot on every connect.
 */
export type OutFrame =
  | { kind: 'evt'; seq: number; evt: AccEvent }
  | { kind: 'sample'; sample: Sample };

export type BusSubscriber = (frame: OutFrame) => void;

const SAMPLE_WINDOW_MS = 2 * 60 * 60 * 1000; // keep ~2h of samples on disk
const SAMPLE_LOAD = 360; // 1h of 10s samples into the in-memory snapshot

export class Bus {
  private state: BusState = emptyState();
  private seq = 0;
  private subscribers = new Set<BusSubscriber>();

  constructor(private db: Db) {}

  /** Fold the persisted log into memory (boot). Corrupt rows are skipped, loudly. */
  replayFromDb(log: (msg: string) => void): void {
    const rows = this.db.select().from(events).orderBy(asc(events.seq)).all();
    for (const row of rows) {
      try {
        const evt = parseEvent({
          id: row.id,
          ts: row.ts,
          type: row.type,
          source: { kind: row.sourceKind, ref: row.sourceRef },
          payload: JSON.parse(row.payload),
        });
        this.state = reduce(this.state, evt);
        this.seq = row.seq;
      } catch {
        log(`skipping unparseable event seq=${row.seq} type=${row.type}`);
      }
    }
    this.loadSamples();
  }

  /** Seed the in-memory samples ring from the dedicated table (samples aren't in the log). */
  private loadSamples(): void {
    const rows = this.db
      .select()
      .from(samples)
      .orderBy(asc(samples.ts))
      .all()
      .slice(-SAMPLE_LOAD);
    this.state = {
      ...this.state,
      samples: rows.map((r) => ({ ts: r.ts, cpuPct: r.cpuPct, memPct: r.memPct, netPct: r.netPct })),
    };
  }

  /** Validate, persist, fold, broadcast. Duplicate ids are ignored (idempotent seeds). */
  publish(input: unknown): { seq: number; evt: AccEvent } | null {
    const evt = parseEvent(input);
    const res = this.db
      .insert(events)
      .values({
        id: evt.id,
        type: evt.type,
        ts: evt.ts,
        sourceKind: evt.source.kind,
        sourceRef: evt.source.ref,
        payload: JSON.stringify(evt.payload),
      })
      .onConflictDoNothing()
      .run();
    if (res.changes === 0) return null; // already persisted (seed rerun) — no re-broadcast

    const seq = Number(res.lastInsertRowid);
    this.seq = seq;
    this.state = reduce(this.state, evt);
    for (const fn of this.subscribers) fn({ kind: 'evt', seq, evt });
    return { seq, evt };
  }

  /**
   * Record a sysmon sample: persist to the samples table (not the event log), fold into
   * the in-memory ring, and broadcast on the transient channel. `ts` is provided so
   * the demo seed can produce deterministic sample times.
   */
  pushSample(cpuPct: number, memPct: number, netPct: number, ts = new Date().toISOString()): Sample {
    this.db.insert(samples).values({ ts, cpuPct, memPct, netPct }).run();
    const cutoff = new Date(Date.parse(ts) - SAMPLE_WINDOW_MS).toISOString();
    this.db.delete(samples).where(lt(samples.ts, cutoff)).run();

    const sample: Sample = { ts, cpuPct, memPct, netPct };
    this.state = reduce(this.state, { type: 'system.sample', ts, payload: { cpuPct, memPct, netPct } });
    for (const fn of this.subscribers) fn({ kind: 'sample', sample });
    return sample;
  }

  /** Persisted events after `sinceSeq` — the Last-Event-ID replay path. */
  eventsSince(sinceSeq: number): Array<{ seq: number; evt: AccEvent }> {
    const rows = this.db
      .select()
      .from(events)
      .where(gt(events.seq, sinceSeq))
      .orderBy(asc(events.seq))
      .all();
    const out: Array<{ seq: number; evt: AccEvent }> = [];
    for (const row of rows) {
      try {
        out.push({
          seq: row.seq,
          evt: parseEvent({
            id: row.id,
            ts: row.ts,
            type: row.type,
            source: { kind: row.sourceKind, ref: row.sourceRef },
            payload: JSON.parse(row.payload),
          }),
        });
      } catch {
        // skip unparseable rows; the snapshot path remains authoritative
      }
    }
    return out;
  }

  snapshot(): { seq: number; state: BusState } {
    return { seq: this.seq, state: this.state };
  }

  subscribe(fn: BusSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
