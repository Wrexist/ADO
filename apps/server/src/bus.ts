/**
 * The event bus: publish → zod-validate → persist (events table) → fold into the
 * in-memory snapshot (shared reducer) → broadcast to SSE subscribers.
 *
 * State is a pure fold over the events table: on boot we replay the log, so the
 * snapshot served to new SSE clients is always consistent with history, and
 * Last-Event-ID replay comes straight from the same table (council S5).
 */
import { asc, gt } from 'drizzle-orm';
import { parseEvent, type AccEvent, emptyState, reduce, type BusState } from '@ado/shared';
import type { Db } from './db';
import { events } from './db/schema';

export type BusSubscriber = (seq: number, evt: AccEvent) => void;

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
    for (const fn of this.subscribers) fn(seq, evt);
    return { seq, evt };
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
