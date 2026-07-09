/**
 * Typed event contracts — the spine of the system.
 *
 * Every server→client value flows through one of these zod-validated events and is
 * persisted with its source (see GOALS.md guardrails 1–2, .claude/ops.yml integrity).
 * The UI renders ONLY what arrived as an event; a value with no event is missing/stale,
 * never a plausible guess.
 *
 * Phase 0 ships the envelope + a representative skeleton of the union to lock the pattern.
 * Phase 2 fills in the full catalog from docs/DATA_MAP.md (repos, builds, deployments,
 * agents, activity, system samples, health, snapshots).
 */
import { z } from 'zod';

/** Where a value came from — required so nothing on screen is sourceless. */
export const EventSource = z.object({
  kind: z.enum(['scanner', 'github', 'runner', 'sysmon', 'health', 'learn', 'mock']),
  ref: z.string().describe('stable id of the origin: repo path, run id, sample id, …'),
});
export type EventSource = z.infer<typeof EventSource>;

/** Fields every event carries. */
const base = {
  id: z.string(),
  ts: z.string().datetime({ offset: true }),
  source: EventSource,
};

// —— Representative event skeleton (extended in Phase 2) ————————————————————————

export const RepoUpdatedEvent = z.object({
  ...base,
  type: z.literal('repo.updated'),
  payload: z.object({
    repo: z.string(),
    branch: z.string(),
    lastCommitTs: z.string().datetime({ offset: true }),
    openTasks: z.number().int().nonnegative(),
    category: z.enum(['game', 'app', 'web', 'api', 'library', 'service']),
  }),
});

export const AgentProgressEvent = z.object({
  ...base,
  type: z.literal('agent.progress'),
  payload: z.object({
    agentId: z.string(),
    name: z.string(),
    status: z.string(), // e.g. "Analyzing code…"
    /** null when the stream format is opaque — render "running (opaque)", never guess a % */
    percent: z.number().min(0).max(100).nullable(),
  }),
});

export const SystemSampleEvent = z.object({
  ...base,
  type: z.literal('system.sample'),
  payload: z.object({
    cpuPct: z.number().min(0).max(100),
    memPct: z.number().min(0).max(100),
    netPct: z.number().min(0).max(100),
  }),
});

/** The discriminated union all consumers switch on. */
export const AccEvent = z.discriminatedUnion('type', [
  RepoUpdatedEvent,
  AgentProgressEvent,
  SystemSampleEvent,
]);

export type AccEvent = z.infer<typeof AccEvent>;
export type AccEventType = AccEvent['type'];

/** Parse an unknown payload from the bus/SSE into a typed event (throws on mismatch). */
export function parseEvent(input: unknown): AccEvent {
  return AccEvent.parse(input);
}
