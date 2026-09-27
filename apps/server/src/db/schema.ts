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

export const portfolioProjects = sqliteTable('portfolio_projects', {
  id: text('id').primaryKey(), name: text('name').notNull(), kind: text('kind').notNull(), goal: text('goal').notNull(),
  lifecycle: text('lifecycle').notNull(), focus: integer('focus', { mode: 'boolean' }).notNull(), manualPriority: integer('manual_priority').notNull(),
  nextTaskId: text('next_task_id'), createdTs: text('created_ts').notNull(), updatedTs: text('updated_ts').notNull(), version: integer('version').notNull(),
});
export const portfolioRepositories = sqliteTable('portfolio_repositories', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => portfolioProjects.id), host: text('host').notNull(), externalId: text('external_id').notNull(),
  name: text('name').notNull(), canonicalRemote: text('canonical_remote'), defaultBranch: text('default_branch'), observedTs: text('observed_ts').notNull(),
}, (t) => [uniqueIndex('portfolio_repository_identity').on(t.host, t.externalId)]);
export const portfolioCheckouts = sqliteTable('portfolio_checkouts', {
  id: text('id').primaryKey(), repositoryId: text('repository_id').notNull().references(() => portfolioRepositories.id), hostId: text('host_id').notNull(),
  canonicalPath: text('canonical_path').notNull(), pathIdentity: text('path_identity').notNull(), gitIdentity: text('git_identity').notNull(), sourceId: text('source_id').notNull(),
  managed: integer('managed', { mode: 'boolean' }).notNull(), headSha: text('head_sha'), observedTs: text('observed_ts').notNull(),
}, (t) => [uniqueIndex('portfolio_checkout_path').on(t.hostId, t.canonicalPath), uniqueIndex('portfolio_checkout_identity').on(t.hostId, t.pathIdentity)]);
export const portfolioSources = sqliteTable('portfolio_sources', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), dataJson: text('data_json').notNull(), observedTs: text('observed_ts').notNull(),
});

export const planningMilestones = sqliteTable('planning_milestones', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => portfolioProjects.id), title: text('title').notNull(),
  exitCriteriaJson: text('exit_criteria_json').notNull(), status: text('status').notNull(), version: integer('version').notNull(), createdTs: text('created_ts').notNull(), updatedTs: text('updated_ts').notNull(),
});
export const planningTasks = sqliteTable('planning_tasks', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(() => portfolioProjects.id), repositoryId: text('repository_id').references(() => portfolioRepositories.id), milestoneId: text('milestone_id').references(() => planningMilestones.id),
  title: text('title').notNull(), outcome: text('outcome').notNull(), scope: text('scope').notNull(), outOfScope: text('out_of_scope').notNull(), acceptanceJson: text('acceptance_json').notNull(), sourceRefsJson: text('source_refs_json').notNull(),
  priority: integer('priority').notNull(), status: text('status').notNull(), version: integer('version').notNull(), createdTs: text('created_ts').notNull(), updatedTs: text('updated_ts').notNull(),
});
export const planningDependencies = sqliteTable('planning_dependencies', {
  taskId: text('task_id').notNull().references(() => planningTasks.id), dependsOn: text('depends_on').notNull().references(() => planningTasks.id),
}, (t) => [uniqueIndex('planning_dependency_identity').on(t.taskId, t.dependsOn)]);
export const planningInbox = sqliteTable('planning_inbox', {
  id: text('id').primaryKey(), idempotencyKey: text('idempotency_key').notNull().unique(), requestHash: text('request_hash').notNull(), text: text('text').notNull(),
  projectId: text('project_id').references(() => portfolioProjects.id), taskId: text('task_id').references(() => planningTasks.id), promotionHash: text('promotion_hash'), status: text('status').notNull(), version: integer('version').notNull(), createdTs: text('created_ts').notNull(), updatedTs: text('updated_ts').notNull(),
});
export const planningRevisions = sqliteTable('planning_revisions', {
  id: text('id').primaryKey(), entityId: text('entity_id').notNull(), kind: text('kind').notNull(), version: integer('version').notNull(), snapshotJson: text('snapshot_json').notNull(), recordedTs: text('recorded_ts').notNull(),
}, (t) => [uniqueIndex('planning_revision_identity').on(t.entityId, t.version)]);

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
