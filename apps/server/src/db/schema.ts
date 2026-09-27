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
    provider: text('provider').notNull().default('claude'),
    status: text('status').notNull(), // queued | running | done | failed
    startedTs: text('started_ts').notNull(),
    endedTs: text('ended_ts'),
    durationMs: integer('duration_ms'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    turns: integer('turns'),
    // Human outcome and independent verification are separate; acceptance binds exact content.
    verifyVerdict: text('verify_verdict'), // pass | fail | null
    humanAction: text('human_action'), // accepted | corrected | redone | null until judged
    exitCode: integer('exit_code'),
    note: text('note'), // e.g. "orphaned on boot", "opaque stream"
    resultText: text('result_text'), // the agent's final message (capped); null = none captured
    workspacePath: text('workspace_path'),
    baseSha: text('base_sha'),
    branch: text('branch'),
    headSha: text('head_sha'),
    diffDigest: text('diff_digest'),
    engineVersion: integer('engine_version').notNull().default(0),
    idempotencyKey: text('idempotency_key'),
    requestHash: text('request_hash'),
    diagnostics: text('diagnostics'),
    processIdentity: text('process_identity'),
    processTermination: text('process_termination'), // confirmed | unconfirmed | null (legacy/unsupported)
  },
  (t) => [index('runs_repo_idx').on(t.repoId), index('runs_status_idx').on(t.status)],
);

/** Never expire a writer lock merely because its owner stopped heartbeating. */
export const executionLocks = sqliteTable('execution_locks', {
  resource: text('resource').primaryKey(),
  runId: text('run_id').notNull(),
  owner: text('owner').notNull(),
  acquiredTs: text('acquired_ts').notNull(),
});

export const verificationEvidence = sqliteTable('verification_evidence', {
  id: text('id').primaryKey(), runId: text('run_id').notNull(), headSha: text('head_sha').notNull(),
  diffDigest: text('diff_digest').notNull(), command: text('command').notNull(),
  exitCode: integer('exit_code').notNull(), verdict: text('verdict').notNull(),
  output: text('output').notNull(), recordedTs: text('recorded_ts').notNull(),
});

export const approvalPolicyVersions = sqliteTable('approval_policy_versions', {
  version: text('version').primaryKey(), repoId: text('repo_id').notNull(), digest: text('digest').notNull(),
  snapshotJson: text('snapshot_json').notNull(), createdTs: text('created_ts').notNull(),
});

export const approvalPolicies = sqliteTable('approval_policies', {
  repoId: text('repo_id').primaryKey(), version: text('version').notNull().references(() => approvalPolicyVersions.version), digest: text('digest').notNull(),
});

/** Prepared review bindings become decisions only when explicitly consumed. */
export const operationApprovals = sqliteTable('operation_approvals', {
  id: text('id').primaryKey(), actorId: text('actor_id').notNull(), operation: text('operation').notNull(),
  runId: text('run_id').notNull(), repoId: text('repo_id').notNull(), headSha: text('head_sha').notNull(),
  diffDigest: text('diff_digest').notNull(), payloadHash: text('payload_hash').notNull(), payloadJson: text('payload_json').notNull(),
  policyVersion: text('policy_version').notNull().references(() => approvalPolicyVersions.version), issuedTs: text('issued_ts').notNull(), expiresTs: text('expires_ts').notNull(),
  consumedTs: text('consumed_ts'), revokedTs: text('revoked_ts'), revokeReason: text('revoke_reason'),
}, (t) => [index('operation_approvals_run_idx').on(t.runId, t.issuedTs)]);
