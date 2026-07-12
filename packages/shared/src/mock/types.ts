/**
 * Fixture types — the shapes every DESIGN_SPEC widget renders from in Phase 1.
 *
 * Phase 1 components consume these via mock slices; Phase 2 replaces the VALUES with
 * bus-event-derived data of the same shape (widgets go live per docs/DATA_MAP.md, and
 * these types converge with the contracts in ../events.ts).
 */

export type Tone = 'violet' | 'success' | 'warning' | 'info' | 'danger' | 'pink';
export type Trend = 'up' | 'down';
export type RepoCategory = 'game' | 'app' | 'web' | 'api' | 'library' | 'service';
export type RepoStatus = 'active' | 'testing' | 'blocked' | 'archived';
export type ProgressState = 'success' | 'running' | 'queued' | 'failed';
export type ServiceState = 'operational' | 'degraded' | 'down';
export type Language = 'typescript' | 'swift' | 'liquid' | 'python';
export type DeployEnv = 'production' | 'testflight' | 'staging';

/**
 * The frozen fixture clock. All fixture timestamps are literals relative to this instant —
 * never Date.now() — so this module doubles as the deterministic --demo seed the P3.5
 * visual baselines render against (council B2).
 */
export const MOCK_NOW = '2026-07-09T08:00:00.000Z';

export interface StatDelta {
  label: string; // "2 this week", "12% vs last week"
  trend: Trend;
  tone: Tone;
}

export interface SparklineChart {
  kind: 'sparkline';
  points: number[]; // >=2 points — the same floor the real UI enforces
  tone: Tone;
}

/** Radial rings carry an explicit denominator — a ratio, never a lone integer (council S3). */
export interface RadialChart {
  kind: 'radial';
  value: number;
  max: number;
  tone: Tone;
}

export interface StatCardFixture {
  id: string;
  label: string;
  /** Display string exactly as rendered ("12", "≈2.4M", "98%"). Illustrative per view (council B1). */
  value: string;
  sub?: string; // "6 running" / "Running now" / "Excellent"
  delta?: StatDelta;
  icon: string; // icon token name; the kit maps it to a glyph
  iconTone: Tone;
  chart?: SparklineChart | RadialChart;
}

export interface FilterTabFixture {
  id: string;
  label: string;
  count: number;
}

export interface RepoCardFixture {
  id: string;
  name: string;
  category: RepoCategory;
  tagLabel: string; // pill text: Game / App / Web / API / Library
  status: RepoStatus;
  description: string;
  branch: string;
  updatedTs: string; // ISO, relative to MOCK_NOW
  updatedLabel: string; // "2h ago" — precomputed so the seed stays frozen
  progress: { label: string; pct: number; state: ProgressState };
  agents: string[]; // agent ids that touched the repo (avatar stack — no fake teammates)
  agentsOverflow?: number; // "+N"
}

export interface RunningAgentFixture {
  id: string;
  name: string;
  statusLine: string; // "Analyzing code…"
  pct: number;
  tone: Tone;
  icon: string; // icon token name — data decides, views never guess
}

export interface ActivityItemFixture {
  id: string;
  title: string;
  detail: string;
  ts: string;
  agoLabel: string;
  tone: Tone;
  icon: string; // icon token name — data decides, views never guess
}

export interface SystemStatusRowFixture {
  id: string;
  name: string;
  state: ServiceState;
}

export interface ProjectRowFixture {
  id: string;
  name: string;
  subtitle: string;
  language: Language;
  stars: number;
  prs: number;
  status: {
    kind: 'building' | 'deploying' | 'live' | 'testing';
    label: string;
    detail?: string; // "2m 15s" / "v2.4.1" / "12 tests"
  };
}

export interface BuildQueueItemFixture {
  id: string;
  repo: string;
  jobLabel: string; // "#142 Build and Test"
  branch: string;
  state: 'running' | 'queued';
  elapsedSec: number | null; // null when queued
  durationLabel: string | null; // rendered inside a reserved-width mask (council B3)
}

export interface AgentRosterItemFixture {
  id: string;
  name: string;
  statusLine: string;
  state: 'active' | 'idle';
}

export interface MonitorSeriesFixture {
  id: 'cpu' | 'memory' | 'network';
  label: string;
  valuePct: number;
  tone: Tone;
  points: number[];
}

export interface QuickActionFixture {
  id: string;
  label: string;
  icon: string;
}

export interface DeploymentItemFixture {
  id: string;
  name: string;
  env: DeployEnv;
  envLabel: string;
  ts: string;
  agoLabel: string;
  ok: boolean;
}

export interface ViewAMock {
  header: { greeting: string; subtitle: string };
  sidebarCounts: { repositories: number; games: number; agents: number };
  stats: StatCardFixture[];
  repoTabs: FilterTabFixture[];
  repos: RepoCardFixture[]; // grid renders the first 6; the rest sit behind "View all"
  runningAgents: RunningAgentFixture[];
  activity: ActivityItemFixture[];
  systemStatus: SystemStatusRowFixture[];
  commandCenter: { title: string; tagline: string; placeholder: string };
  helpCard: { title: string; body: string; cta: string };
}

export interface ViewBMock {
  header: { greeting: string; subtitle: string };
  stats: StatCardFixture[];
  projectTabs: string[];
  projects: ProjectRowFixture[];
  buildQueue: BuildQueueItemFixture[];
  activity: ActivityItemFixture[];
  agentRoster: AgentRosterItemFixture[];
  addAgentLabel: string;
  assistant: { placeholder: string; chips: string[] };
  monitor: MonitorSeriesFixture[];
  quickActions: QuickActionFixture[];
  deployments: DeploymentItemFixture[];
  proPlan: { title: string; body: string; cta: string };
}
