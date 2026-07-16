/**
 * Domain entities + bus state — zod-first (types are inferred from schemas so both
 * ends validate the same contracts, CLAUDE.md convention 2).
 *
 * ONE reducer serves both sides: the server folds events into the snapshot it serves
 * on SSE connect; the web folds live deltas into the Zustand store. Same function,
 * no drift.
 */
import { z } from 'zod';
import { AutoReview } from './autoreview';
import { Diagnosis, Incident, IncidentRecord } from './incidents';

// —— enums ————————————————————————————————————————————————————————————————————

export const RepoCategory = z.enum(['game', 'app', 'web', 'api', 'library', 'service']);
export type RepoCategory = z.infer<typeof RepoCategory>;

export const RepoStatus = z.enum(['active', 'testing', 'blocked', 'archived']);
export type RepoStatus = z.infer<typeof RepoStatus>;

export const Language = z.enum(['typescript', 'swift', 'liquid', 'python']);
export type Language = z.infer<typeof Language>;

export const CiState = z.enum(['success', 'running', 'queued', 'failed']);
export type CiState = z.infer<typeof CiState>;

export const BuildState = z.enum(['running', 'queued', 'success', 'failed']);
export type BuildState = z.infer<typeof BuildState>;

export const DeployEnv = z.enum(['production', 'testflight', 'staging']);
export type DeployEnv = z.infer<typeof DeployEnv>;

export const AgentStatus = z.enum(['running', 'active', 'idle', 'done', 'failed']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const AgentKind = z.enum(['runner', 'configured']);
export type AgentKind = z.infer<typeof AgentKind>;

export const HealthService = z.enum(['github', 'anthropic', 'server', 'runner']);
export type HealthService = z.infer<typeof HealthService>;

export const ServiceState = z.enum(['operational', 'degraded', 'down']);
export type ServiceState = z.infer<typeof ServiceState>;

/** UI tone tokens — aligned with the design tokens + kit; validated, not a free string. */
export const Tone = z.enum(['violet', 'success', 'warning', 'info', 'danger', 'pink', 'muted']);
export type Tone = z.infer<typeof Tone>;

/** ISO-8601 timestamp with offset — reused by every entity so a bad stamp fails at the boundary. */
export const isoTs = z.string().datetime({ offset: true });

// —— entities —————————————————————————————————————————————————————————————————

export const RepoCI = z.object({
  label: z.string(), // workflow name ("Build & Test")
  pct: z.number().min(0).max(100),
  state: CiState,
});
export type RepoCI = z.infer<typeof RepoCI>;

export const Repo = z.object({
  id: z.string(),
  name: z.string(),
  category: RepoCategory,
  status: RepoStatus,
  description: z.string(),
  branch: z.string(),
  updatedTs: isoTs,
  language: Language.optional(),
  stars: z.number().int().nonnegative().optional(),
  prs: z.number().int().nonnegative().optional(),
  openTasks: z.number().int().nonnegative().optional(),
  /** Absent = no CI runs known — render the honest "no CI" state, never a fake bar. */
  ci: RepoCI.optional(),
  /** Optional so a scanner upsert (which doesn't know agents) never clobbers runner-set ones. */
  agents: z.array(z.string()).optional(),
});
export type Repo = z.infer<typeof Repo>;

/** Enrichment patch — GitHub (2.3) and the runner (P3) merge fields into a scanned repo. */
export const RepoPatch = z.object({
  language: Language.optional(),
  stars: z.number().int().nonnegative().optional(),
  prs: z.number().int().nonnegative().optional(),
  ci: RepoCI.optional(),
  agents: z.array(z.string()).optional(),
});
export type RepoPatch = z.infer<typeof RepoPatch>;

export const Build = z.object({
  id: z.string(),
  repo: z.string(),
  jobLabel: z.string(), // "#142 Build and Test"
  branch: z.string(),
  state: BuildState,
  startedTs: isoTs.nullable(),
  /** null while queued — honest absence, the UI masks it as "Queued". */
  elapsedSec: z.number().int().nonnegative().nullable(),
});
export type Build = z.infer<typeof Build>;

export const Deployment = z.object({
  id: z.string(),
  name: z.string(),
  env: DeployEnv,
  ts: isoTs,
  ok: z.boolean(),
  /** Repo this deployment belongs to — powers the per-project history. Optional for
   *  back-compat with events persisted before repo tagging. */
  repoId: z.string().optional(),
});
export type Deployment = z.infer<typeof Deployment>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  tone: Tone,
  kind: AgentKind, // runner = dispatched process; configured = roster definition
  status: AgentStatus,
  statusLine: z.string(),
  /** null = stream format opaque — render indeterminate, never a guessed % (adapter rule). */
  pct: z.number().min(0).max(100).nullable(),
});
export type Agent = z.infer<typeof Agent>;

export const ActivityItem = z.object({
  id: z.string(),
  icon: z.string(),
  tone: Tone,
  title: z.string(),
  detail: z.string(),
  ts: isoTs,
  /** Repo this activity belongs to — powers the per-project feed. Optional: absent = not
   *  repo-scoped (agent-level, system), and older persisted events replay without it. */
  repoId: z.string().optional(),
});
export type ActivityItem = z.infer<typeof ActivityItem>;

export const Sample = z.object({
  ts: isoTs,
  cpuPct: z.number().min(0).max(100),
  memPct: z.number().min(0).max(100),
  netPct: z.number().min(0).max(100),
});
export type Sample = z.infer<typeof Sample>;

export const HealthCheck = z.object({
  service: HealthService,
  state: ServiceState,
  checkedTs: isoTs,
});
export type HealthCheck = z.infer<typeof HealthCheck>;

export const TokensState = z.object({
  /** null = unavailable (unknown session-log format) — UI renders ≈— (council S2). */
  approxTokens: z.number().nonnegative().nullable(),
  windowLabel: z.string(), // "7 days"
  updatedTs: isoTs,
});
export type TokensState = z.infer<typeof TokensState>;

// —— bus state (the SSE snapshot payload) ————————————————————————————————————

const SAMPLE_CAP = 360; // 1h of 10s samples
const ACTIVITY_CAP = 100;
const DEPLOYMENT_CAP = 50;
const BUILD_CAP = 100; // evict oldest TERMINAL builds past this; live builds are never dropped
const STAT_HISTORY_CAP = 60; // ~2 months of daily stat snapshots per key (for trend deltas)
const INCIDENT_CAP = 50; // newest-first ring of self-diagnosis incidents
const AUTOREVIEW_CAP = 30; // newest-first ring of auto-review results

/** One day's stored value of a headline stat — the source for "↑2 this week" deltas. */
export const StatPoint = z.object({ day: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const BusState = z.object({
  repos: z.record(z.string(), Repo),
  builds: z.record(z.string(), Build),
  deployments: z.array(Deployment),
  agents: z.record(z.string(), Agent),
  activity: z.array(ActivityItem), // newest first
  samples: z.array(Sample), // oldest first, capped
  health: z.record(z.string(), HealthCheck),
  tokens: TokensState.nullable(),
  statHistory: z.record(z.string(), z.array(StatPoint)), // key → daily points, oldest first
  incidents: z.array(IncidentRecord), // newest first, capped — self-diagnosis feed
  autoReviews: z.array(AutoReview), // newest first, capped — structured AI code reviews
});
export type BusState = z.infer<typeof BusState>;

export function emptyState(): BusState {
  return {
    repos: {},
    builds: {},
    deployments: [],
    agents: {},
    activity: [],
    samples: [],
    health: {},
    tokens: null,
    statHistory: {},
    incidents: [],
    autoReviews: [],
  };
}

// —— reducer ——————————————————————————————————————————————————————————————————

/** Minimal structural typing so the reducer needs no import cycle with events.ts. */
export type ReducibleEvent = { type: string; ts: string; payload: unknown };

/** Fold one event into state. Pure; returns a new object (safe for Zustand). */
export function reduce(state: BusState, evt: ReducibleEvent): BusState {
  const p = evt.payload as never;
  switch (evt.type) {
    case 'repo.upserted': {
      // Merge, not replace: scanner owns base fields, GitHub/runner own enrichment.
      // Strip undefined from the incoming repo so a source that omits (scanner: no CI/
      // agents) OR explicitly clears an enrichment field never wipes what another source
      // set — the merge stays additive and enrichment-safe for every field, not just agents.
      const { repo } = p as { repo: Repo };
      const prev = state.repos[repo.id];
      const incoming = Object.fromEntries(Object.entries(repo).filter(([, v]) => v !== undefined));
      const merged = { ...prev, ...incoming } as Repo;
      return { ...state, repos: { ...state.repos, [repo.id]: merged } };
    }
    case 'repo.enriched': {
      const { repoId, patch } = p as { repoId: string; patch: RepoPatch };
      const prev = state.repos[repoId];
      if (!prev) return state; // enrichment for an unknown repo is dropped honestly
      return { ...state, repos: { ...state.repos, [repoId]: { ...prev, ...patch } } };
    }
    case 'repo.removed': {
      const { repoId } = p as { repoId: string };
      const repos = { ...state.repos };
      delete repos[repoId];
      return { ...state, repos };
    }
    case 'build.updated': {
      const { build } = p as { build: Build };
      const builds = { ...state.builds, [build.id]: build };
      // Bound the map: on an always-on server, an id-per-CI-run would grow forever and
      // re-serialize into every snapshot frame. Evict OLDEST TERMINAL builds first;
      // never drop running/queued (those are live and bounded by the runner semaphore).
      const ids = Object.keys(builds);
      if (ids.length > BUILD_CAP) {
        const terminal = ids
          .map((id) => builds[id])
          .filter((b) => b.state === 'success' || b.state === 'failed')
          .sort((a, b) => (a.startedTs ?? '').localeCompare(b.startedTs ?? ''));
        let over = ids.length - BUILD_CAP;
        for (const b of terminal) {
          if (over <= 0) break;
          delete builds[b.id];
          over--;
        }
      }
      return { ...state, builds };
    }
    case 'deploy.recorded': {
      // Newest-first BY TIMESTAMP (not arrival): replays and out-of-order seeds must render
      // in time order. Sort before the cap so the cap drops the truly oldest.
      const { deployment } = p as { deployment: Deployment };
      const deployments = [deployment, ...state.deployments.filter((d) => d.id !== deployment.id)]
        .sort((a, b) => b.ts.localeCompare(a.ts))
        .slice(0, DEPLOYMENT_CAP);
      return { ...state, deployments };
    }
    case 'agent.upserted': {
      const { agent } = p as { agent: Agent };
      return { ...state, agents: { ...state.agents, [agent.id]: agent } };
    }
    case 'agent.removed': {
      const { agentId } = p as { agentId: string };
      const agents = { ...state.agents };
      delete agents[agentId];
      return { ...state, agents };
    }
    case 'activity.appended': {
      // Newest-first BY TIMESTAMP (not arrival) — same rationale as deploy.recorded.
      const { item } = p as { item: ActivityItem };
      const activity = [item, ...state.activity.filter((a) => a.id !== item.id)]
        .sort((a, b) => b.ts.localeCompare(a.ts))
        .slice(0, ACTIVITY_CAP);
      return { ...state, activity };
    }
    case 'system.sample': {
      const sample = { ts: evt.ts, ...(p as Omit<Sample, 'ts'>) };
      const samples = [...state.samples, sample].slice(-SAMPLE_CAP);
      return { ...state, samples };
    }
    case 'health.checked': {
      const check = p as { service: HealthService; state: ServiceState };
      return {
        ...state,
        health: {
          ...state.health,
          [check.service]: { service: check.service, state: check.state, checkedTs: evt.ts },
        },
      };
    }
    case 'tokens.rollup': {
      const t = p as { approxTokens: number | null; windowLabel: string };
      return { ...state, tokens: { ...t, updatedTs: evt.ts } };
    }
    case 'stats.snapshot': {
      // Fold one day's headline values into per-key history (last write per day wins),
      // kept oldest-first and capped. This is what trend deltas read from — no history,
      // no delta (honest), never a computed-from-thin-air number.
      const { day, values } = p as { day: string; values: Record<string, number> };
      const statHistory = { ...state.statHistory };
      for (const [key, value] of Object.entries(values)) {
        const rest = (statHistory[key] ?? []).filter((e) => e.day !== day);
        statHistory[key] = [...rest, { day, value }]
          .sort((a, b) => a.day.localeCompare(b.day))
          .slice(-STAT_HISTORY_CAP);
      }
      return { ...state, statHistory };
    }
    case 'incident.reported': {
      // Newest-first, dedupe by id, bounded. A re-reported id replaces the prior record
      // (a fresh occurrence supersedes it) — matches activity.appended semantics.
      const { incident } = p as { incident: Incident };
      const incidents = [incident, ...state.incidents.filter((i) => i.id !== incident.id)].slice(
        0,
        INCIDENT_CAP,
      );
      return { ...state, incidents };
    }
    case 'autoreview.updated': {
      // Upsert by review id: the running row is replaced by its done/failed row (same id),
      // and the freshest update moves to the front. Bounded ring, like incidents.
      const { review } = p as { review: AutoReview };
      const autoReviews = [review, ...state.autoReviews.filter((r) => r.id !== review.id)].slice(
        0,
        AUTOREVIEW_CAP,
      );
      return { ...state, autoReviews };
    }
    case 'incident.diagnosed': {
      // Attach the diagnosis to its incident and flip it to 'diagnosed'. If the incident was
      // already evicted (past the cap) the map is a no-op — dropped honestly, never faked.
      const { incidentId, diagnosis } = p as { incidentId: string; diagnosis: Diagnosis };
      const incidents = state.incidents.map((i) =>
        i.id === incidentId ? { ...i, diagnosis, status: 'diagnosed' as const } : i,
      );
      return { ...state, incidents };
    }
    default:
      // Unknown event type: ignore honestly (forward compatibility) — never crash the UI.
      return state;
  }
}
