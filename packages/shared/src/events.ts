/**
 * Typed event contracts — the spine of the system (full catalog per docs/DATA_MAP.md).
 *
 * Every server→client value flows through one of these zod-validated events and is
 * persisted with its source. The UI renders ONLY what arrived as an event; a value
 * with no event is missing/stale — never a plausible guess.
 *
 * Emission schedule: scanner/github/sysmon/health events go live in Prompts 2.2–2.4,
 * runner events in Phase 3, tokens in Phase 4. `--demo` seeds fixture-shaped events
 * so the pipeline is exercised end-to-end before real sources exist.
 */
import { z } from 'zod';
import { AutoReview } from './autoreview';
import { Diagnosis, Incident } from './incidents';
import {
  Agent,
  ActivityItem,
  Build,
  BusState,
  Deployment,
  HealthService,
  Repo,
  RepoPatch,
  ServiceState,
} from './state';

/** Where a value came from — required so nothing on screen is sourceless. */
export const EventSource = z.object({
  kind: z.enum(['scanner', 'github', 'runner', 'sysmon', 'health', 'learn', 'tokens', 'app', 'demo']),
  ref: z.string().describe('stable id of the origin: repo path, run id, sample id, …'),
});
export type EventSource = z.infer<typeof EventSource>;

/** Fields every event carries. */
const base = {
  id: z.string(),
  ts: z.string().datetime({ offset: true }),
  source: EventSource,
};

// —— catalog ——————————————————————————————————————————————————————————————————

export const RepoUpsertedEvent = z.object({
  ...base,
  type: z.literal('repo.upserted'),
  payload: z.object({ repo: Repo }),
});

export const RepoEnrichedEvent = z.object({
  ...base,
  type: z.literal('repo.enriched'),
  payload: z.object({ repoId: z.string(), patch: RepoPatch }),
});

export const RepoRemovedEvent = z.object({
  ...base,
  type: z.literal('repo.removed'),
  payload: z.object({ repoId: z.string() }),
});

export const BuildUpdatedEvent = z.object({
  ...base,
  type: z.literal('build.updated'),
  payload: z.object({ build: Build }),
});

export const DeployRecordedEvent = z.object({
  ...base,
  type: z.literal('deploy.recorded'),
  payload: z.object({ deployment: Deployment }),
});

export const AgentUpsertedEvent = z.object({
  ...base,
  type: z.literal('agent.upserted'),
  payload: z.object({ agent: Agent }),
});

export const AgentRemovedEvent = z.object({
  ...base,
  type: z.literal('agent.removed'),
  payload: z.object({ agentId: z.string() }),
});

export const ActivityAppendedEvent = z.object({
  ...base,
  type: z.literal('activity.appended'),
  payload: z.object({ item: ActivityItem }),
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

export const HealthCheckedEvent = z.object({
  ...base,
  type: z.literal('health.checked'),
  payload: z.object({ service: HealthService, state: ServiceState }),
});

export const TokensRollupEvent = z.object({
  ...base,
  type: z.literal('tokens.rollup'),
  payload: z.object({
    approxTokens: z.number().nonnegative().nullable(), // null = honest "unavailable"
    windowLabel: z.string(),
  }),
});

/**
 * One-per-day rollup of headline stat values → powers the "↑2 this week" deltas.
 * Deltas are computed against these STORED daily values (never invented): a fresh
 * install shows no delta until a day of history accrues; --demo seeds a week.
 */
export const StatsSnapshotEvent = z.object({
  ...base,
  type: z.literal('stats.snapshot'),
  payload: z.object({
    day: z.string(), // YYYY-MM-DD — one snapshot per day (event id is stable per day)
    values: z.record(z.string(), z.number()), // key (repos/deployments/agentsActive/tokens) → value
  }),
});

/** Logged on every dashboard open — feeds the p2.5 daily-driver gate. */
export const AppOpenedEvent = z.object({
  ...base,
  type: z.literal('app.opened'),
  payload: z.object({ sessionId: z.string() }),
});

/** A failure captured anywhere (server/web/runner) — the self-diagnosis feed's raw input. */
export const IncidentReportedEvent = z.object({
  ...base,
  type: z.literal('incident.reported'),
  payload: z.object({ incident: Incident }),
});

/** The AI-or-heuristic root-cause analysis attached to a reported incident. */
export const IncidentDiagnosedEvent = z.object({
  ...base,
  type: z.literal('incident.diagnosed'),
  payload: z.object({ incidentId: z.string(), diagnosis: Diagnosis }),
});

/** An auto-review lifecycle update (running → done/failed) — upserted by review id. */
export const AutoReviewUpdatedEvent = z.object({
  ...base,
  type: z.literal('autoreview.updated'),
  payload: z.object({ review: AutoReview }),
});

/** The discriminated union all consumers switch on. */
export const AccEvent = z.discriminatedUnion('type', [
  RepoUpsertedEvent,
  RepoEnrichedEvent,
  RepoRemovedEvent,
  BuildUpdatedEvent,
  DeployRecordedEvent,
  AgentUpsertedEvent,
  AgentRemovedEvent,
  ActivityAppendedEvent,
  SystemSampleEvent,
  HealthCheckedEvent,
  TokensRollupEvent,
  StatsSnapshotEvent,
  AppOpenedEvent,
  IncidentReportedEvent,
  IncidentDiagnosedEvent,
  AutoReviewUpdatedEvent,
]);
export type AccEvent = z.infer<typeof AccEvent>;
export type AccEventType = AccEvent['type'];

/** Parse an unknown payload from the bus/SSE into a typed event (throws on mismatch). */
export function parseEvent(input: unknown): AccEvent {
  return AccEvent.parse(input);
}

// —— SSE protocol frames ——————————————————————————————————————————————————————
// On connect the server sends a full `snapshot` frame (id = current seq); afterwards
// each event arrives as an `evt` frame (id = its seq). Reconnects with Last-Event-ID
// replay `evt` frames from the persisted log instead (council S5).

export const SnapshotFrame = z.object({
  seq: z.number().int().nonnegative(),
  state: BusState,
});
export type SnapshotFrame = z.infer<typeof SnapshotFrame>;

export function parseSnapshot(input: unknown): SnapshotFrame {
  return SnapshotFrame.parse(input);
}
