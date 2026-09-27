/**
 * The event bus: publish → zod-validate → persist (events table) → fold into the
 * in-memory snapshot (shared reducer) → broadcast to SSE subscribers.
 *
 * State is a pure fold over the events table: on boot we replay the log, so the
 * snapshot served to new SSE clients is always consistent with history, and
 * Last-Event-ID replay comes straight from the same table (council S5).
 */
import { asc, desc, gt, lt, sql } from 'drizzle-orm';
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
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0];

const SAMPLE_WINDOW_MS = 2 * 60 * 60 * 1000; // keep ~2h of samples on disk
const SAMPLE_LOAD = 360; // 1h of 10s samples into the in-memory snapshot

export class Bus {
  private state: BusState = emptyState();
  private seq = 0;
  private subscribers = new Set<BusSubscriber>();
  private outbound: OutFrame[] = [];
  private broadcasting = false;

  constructor(private db: Db) {}

  /**
   * Compact latest-only signals in the event log. health.checked (per service),
   * tokens.rollup (one series), and stats.snapshot (per day) are append-only, but the
   * reducer keeps only the newest of each — so superseded rows are pure boot-replay cost
   * that grows without bound on an always-on server. Delete them, keeping max(seq) per key.
   * Safe: the retained latest folds to the same state, and SSE resume only needs events
   * after the client's checkpoint (and the global max seq is always retained). Run on boot
   * BEFORE replay so the fold is cheaper.
   */
  compact(log: (msg: string) => void = () => {}): number {
    const del = (q: Parameters<Db['run']>[0]) => Number(this.db.run(q).changes ?? 0);
    let removed = 0;
    removed += del(sql`DELETE FROM events WHERE type = 'health.checked' AND seq NOT IN (SELECT MAX(seq) FROM events WHERE type = 'health.checked' GROUP BY source_ref)`);
    // agent.upserted is the highest-volume latest-only type — the runner emits a fresh progress
    // row per tick, all sharing source_ref = runId. Keep only the latest per run so a dispatch
    // doesn't accrete dozens of superseded rows that replay on every boot.
    removed += del(sql`DELETE FROM events WHERE type = 'agent.upserted' AND seq NOT IN (SELECT MAX(seq) FROM events WHERE type = 'agent.upserted' GROUP BY source_ref)`);
    // autoreview.updated: running → done/failed share source_ref = review id; only the latest
    // lifecycle row folds into state, so superseded ones are pure replay cost.
    removed += del(sql`DELETE FROM events WHERE type = 'autoreview.updated' AND seq NOT IN (SELECT MAX(seq) FROM events WHERE type = 'autoreview.updated' GROUP BY source_ref)`);
    removed += del(sql`DELETE FROM events WHERE type = 'tokens.rollup' AND seq NOT IN (SELECT MAX(seq) FROM events WHERE type = 'tokens.rollup')`);
    removed += del(sql`DELETE FROM events WHERE type = 'stats.snapshot' AND seq NOT IN (SELECT MAX(seq) FROM events WHERE type = 'stats.snapshot' GROUP BY json_extract(payload, '$.day'))`);
    if (removed > 0) log(`bus: compacted ${removed} superseded event row(s)`);
    return removed;
  }

  /** Fold the persisted log into memory (boot). Corrupt rows are skipped, loudly. */
  replayFromDb(log: (msg: string) => void): void {
    const db = this.db;
    function* rows() {
      let cursor = 0;
      while (true) {
        const page = db.select().from(events).where(gt(events.seq, cursor)).orderBy(asc(events.seq)).limit(1000).all();
        if (!page.length) return;
        yield* page;
        cursor = page[page.length - 1].seq;
      }
    }
    for (const row of rows()) {
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
      .orderBy(desc(samples.ts))
      .limit(SAMPLE_LOAD)
      .all().reverse();
    this.state = {
      ...this.state,
      samples: rows.map((r) => ({ ts: r.ts, cpuPct: r.cpuPct, memPct: r.memPct, netPct: r.netPct })),
    };
  }

  private persist(tx: Transaction | Db, evt: AccEvent): { seq: number; evt: AccEvent } | null {
    const res = tx
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

    return { seq: Number(res.lastInsertRowid), evt };
  }

  /** The event log doubles as a transactional outbox for local state changes.
   * Nothing reaches memory or subscribers before COMMIT. After a crash, replay
   * recovers committed events; subscribers are never part of the transaction.
   */
  commit<T>(mutate: (tx: Transaction) => T, inputs: unknown[] | ((result: T) => unknown[])): T {
    const { result, frames } = this.db.transaction((tx) => {
      const result = mutate(tx);
      const parsed = (typeof inputs === 'function' ? inputs(result) : inputs).map((input) => parseEvent(input));
      const frames = parsed.map((evt) => this.persist(tx, evt)).filter((frame) => frame !== null);
      return { result, frames };
    });
    for (const { seq, evt } of frames) {
      this.seq = seq;
      this.state = reduce(this.state, evt);
    }
    this.broadcast(frames.map(({ seq, evt }) => ({ kind: 'evt', seq, evt })));
    return result;
  }

  /** Validate, persist, fold, broadcast. Duplicate ids are ignored (idempotent seeds). */
  publish(input: unknown): { seq: number; evt: AccEvent } | null {
    const evt = parseEvent(input);
    const frame = this.persist(this.db, evt);
    if (!frame) return null;
    this.seq = frame.seq;
    this.state = reduce(this.state, evt);
    this.broadcast([{ kind: 'evt', ...frame }]);
    return frame;
  }

  private broadcast(frames: OutFrame[]): void {
    this.outbound.push(...frames);
    if (this.broadcasting) return;
    this.broadcasting = true;
    try {
      // Queue reentrant publications so every subscriber sees increasing cursors.
      for (let index = 0; index < this.outbound.length; index++) {
        const frame = this.outbound[index];
        for (const fn of this.subscribers) {
          try { fn(frame); }
          catch { this.subscribers.delete(fn); }
        }
      }
    } finally { this.outbound = []; this.broadcasting = false; }
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
    this.broadcast([{ kind: 'sample', sample }]);
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

  /** Compaction, corrupt rows and stale cursors must never look like a complete replay. */
  resumeSince(cursor: number): { kind: 'replay'; frames: Array<{ seq: number; evt: AccEvent }> } | { kind: 'snapshot'; snapshot: ReturnType<Bus['snapshot']> } {
    if (Number.isSafeInteger(cursor) && cursor >= 0 && cursor <= this.seq) {
      const frames = this.eventsSince(cursor);
      let expected = cursor;
      if (frames.every((frame) => frame.seq === ++expected) && expected === this.seq) {
        return { kind: 'replay', frames };
      }
    }
    return { kind: 'snapshot', snapshot: this.snapshot() };
  }

  snapshot(): { seq: number; state: BusState } {
    return { seq: this.seq, state: this.state };
  }

  subscribe(fn: BusSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
