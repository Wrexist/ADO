/**
 * SQLite schema (drizzle). The events table is the source of truth — the bus state
 * is a fold over it (replayed on boot, streamed as deltas after). Samples get their
 * own high-volume table in 2.4; jobs backs the catch-up scheduler (Phase 4).
 */
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable(
  'events',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    id: text('id').notNull(),
    type: text('type').notNull(),
    ts: text('ts').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceRef: text('source_ref').notNull(),
    payload: text('payload').notNull(), // JSON, zod-validated before insert
  },
  (t) => [uniqueIndex('events_id_unique').on(t.id), index('events_type_idx').on(t.type)],
);

/** High-frequency sysmon samples (10s) — kept out of the events table (2.4). */
export const samples = sqliteTable(
  'samples',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: text('ts').notNull(),
    cpuPct: real('cpu_pct').notNull(),
    memPct: real('mem_pct').notNull(),
    netPct: real('net_pct').notNull(),
  },
  (t) => [index('samples_ts_idx').on(t.ts)],
);

// (The `snapshots` table was removed — stat deltas now flow through stats.snapshot events
// like everything else; dropped in migration 0002.)

/** Catch-up scheduler: last-run per job; overdue jobs fire on boot (convention 13). */
export const jobs = sqliteTable('jobs', {
  name: text('name').primaryKey(),
  lastRunTs: text('last_run_ts'),
});

/**
 * Run log (SELF_LEARNING §1) — the durable asset the parked analyzer will mine.
 * Every dashboard-dispatched run records the full outcome. Also serves as the runner
 * registry: a `running` row on boot = an orphan (its process died with the server) and
 * is reconciled to `failed`.
 */
export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    repoId: text('repo_id').notNull(),
    task: text('task').notNull(),
    model: text('model').notNull(),
    status: text('status').notNull(), // queued | running | done | failed
    startedTs: text('started_ts').notNull(),
    endedTs: text('ended_ts'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    turns: integer('turns'),
    // Reserved for the (parked) self-learning analyzer — NOT written yet. Kept nullable so the
    // column exists when the analyzer ships; today every run leaves both null (honest unknown).
    verifyVerdict: text('verify_verdict'), // pass | fail | null — reserved, unwritten
    humanAction: text('human_action'), // accepted | corrected | redone | null — reserved, unwritten
    exitCode: integer('exit_code'),
    note: text('note'), // e.g. "orphaned on boot", "opaque stream"
  },
  (t) => [index('runs_repo_idx').on(t.repoId), index('runs_status_idx').on(t.status)],
);
