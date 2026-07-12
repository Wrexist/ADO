/**
 * View derivations over BusState. Every number on screen is computed HERE from stored
 * events — no numeric literals rendered as data. Where history doesn't exist yet
 * (deltas need daily snapshots — 2.4; agent-count/health series — 2.4), the value is
 * absent and the UI shows its honest state instead.
 */
import type { Agent, BusState, Deployment, HealthService, Repo, ServiceState, StatPoint } from '@ado/shared';

export function reposList(s: BusState): Repo[] {
  return Object.values(s.repos).sort((a, b) => b.updatedTs.localeCompare(a.updatedTs));
}

export function repoTabs(s: BusState) {
  const repos = Object.values(s.repos);
  const count = (cat: Repo['category']) => repos.filter((r) => r.category === cat).length;
  return [
    { id: 'all', label: 'All', count: repos.length },
    { id: 'games', label: 'Games', count: count('game') },
    { id: 'apps', label: 'Apps', count: count('app') },
    { id: 'libraries', label: 'Libraries', count: count('library') },
  ];
}

/**
 * Trend delta for a headline stat: the current live value minus its value from ~windowDays
 * ago, read from STORED daily snapshots (stats.snapshot). Returns null until ≥2 days of
 * history exist — no history, no delta (honest), never a fabricated trend. The window is
 * anchored to the latest snapshot day (deterministic; works for the frozen --demo world).
 */
export function statDelta(current: number | null, history: StatPoint[] | undefined, windowDays = 7): number | null {
  if (current == null || !history || history.length < 2) return null;
  const latestDay = history[history.length - 1].day;
  const cutoffMs = Date.parse(`${latestDay}T00:00:00Z`) - windowDays * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const baseline = history.find((p) => p.day >= cutoff && p.day < latestDay) ?? history[0];
  return current - baseline.value;
}

/** Live count of running runner agents — the "Active Agents" headline value. */
export function activeAgentCount(s: BusState): number {
  return Object.values(s.agents).filter((a) => a.kind === 'runner' && a.status === 'running').length;
}

/** A StatCard delta line from a computed weekly change (null/0 → no line — honest). */
export function weekDelta(
  n: number | null,
): { label: string; trend: 'up' | 'down'; tone: 'success' | 'danger' } | undefined {
  if (n == null || n === 0) return undefined;
  return { label: `${Math.abs(n)} this week`, trend: n > 0 ? 'up' : 'down', tone: n > 0 ? 'success' : 'danger' };
}

export function sidebarCounts(s: BusState) {
  const repos = Object.values(s.repos);
  return {
    repositories: repos.length,
    games: repos.filter((r) => r.category === 'game').length,
    agents: Object.keys(s.agents).length,
  };
}

export function runningAgents(s: BusState): Agent[] {
  return Object.values(s.agents).filter((a) => a.kind === 'runner' && a.status === 'running');
}

export function rosterAgents(s: BusState): Agent[] {
  return Object.values(s.agents).filter((a) => a.kind === 'configured');
}

export function activityRecent(s: BusState, n: number) {
  return s.activity.slice(0, n);
}

// Plain service names — each row is a real reachability check, so name the actual thing
// (not an aggregate like "All Systems" or a misleading "Deployments").
const SERVICES: Array<{ service: HealthService; label: string }> = [
  { service: 'server', label: 'Local Server' },
  { service: 'anthropic', label: 'Anthropic API' },
  { service: 'github', label: 'GitHub' },
  { service: 'runner', label: 'Agent Runner' },
];

export function systemStatusRows(s: BusState) {
  return SERVICES.map(({ service, label }) => ({
    id: service,
    name: label,
    state: (s.health[service]?.state ?? 'unknown') as ServiceState | 'unknown',
  }));
}

export function buildRows(s: BusState) {
  const order = { running: 0, queued: 1, failed: 2, success: 3 } as const;
  return Object.values(s.builds).sort((a, b) => order[a.state] - order[b.state]);
}

export function recentDeployments(s: BusState, n: number): Deployment[] {
  return s.deployments.slice(0, n);
}

export function monitorSeries(s: BusState) {
  const pick = (k: 'cpuPct' | 'memPct' | 'netPct') => s.samples.map((x) => x[k]);
  const last = s.samples.at(-1);
  return [
    { id: 'cpu', label: 'CPU Usage', tone: 'info' as const, points: pick('cpuPct'), current: last?.cpuPct ?? null },
    { id: 'memory', label: 'Memory', tone: 'violet' as const, points: pick('memPct'), current: last?.memPct ?? null },
    { id: 'network', label: 'Network', tone: 'success' as const, points: pick('netPct'), current: last?.netPct ?? null },
  ];
}

/**
 * System Health % — deterministic, documented (gate p2 criterion; council D3).
 * Formula: start at 100; per service −10 if degraded, −25 if down, −5 if unknown;
 * minus 15 × (failed builds ÷ total builds). Clamped 0–100. No model, no vibes —
 * the same numbers always give the same percentage. Returns null when NOTHING is
 * known yet (no health checks and no builds) — the honest "no data" state.
 */
export function systemHealthPct(s: BusState): number | null {
  const checks = Object.values(s.health);
  const builds = Object.values(s.builds);
  if (checks.length === 0 && builds.length === 0) return null;

  let pct = 100;
  for (const { service } of SERVICES) {
    const st = s.health[service]?.state;
    if (st === 'degraded') pct -= 10;
    else if (st === 'down') pct -= 25;
    else if (st === undefined) pct -= 5;
  }
  if (builds.length > 0) {
    const failed = builds.filter((b) => b.state === 'failed').length;
    pct -= Math.round(15 * (failed / builds.length));
  }
  return Math.max(0, Math.min(100, pct));
}

export const HEALTH_FORMULA_DOC =
  'System Health = 100 − (10·degraded + 25·down + 5·unknown per service) − 15·(failed builds ÷ total builds), clamped 0–100. Deterministic; computed from stored health-check and build events only.';

/** View B project-row status chip — derived honestly from CI + repo status. */
export type ProjectStatusKind = 'building' | 'queued' | 'failed' | 'passing' | 'testing';
export function projectStatus(repo: Repo): { kind: ProjectStatusKind; label: string; detail?: string } | null {
  if (repo.status === 'testing') return { kind: 'testing', label: 'Testing' };
  if (!repo.ci) return null; // no CI known — render the honest "no CI" state
  switch (repo.ci.state) {
    case 'running':
      return { kind: 'building', label: 'Building' };
    case 'queued':
      return { kind: 'queued', label: 'Queued' };
    case 'failed':
      return { kind: 'failed', label: 'Failed' };
    case 'success':
      return { kind: 'passing', label: 'Passing' };
  }
}

/**
 * Sidebar highlight: exact match, or a parent nav item on a sub-route (so /repositories/:id
 * lights up "Repositories"). Query-string nav items (?cat=…) are matched exactly elsewhere.
 */
export function isNavActive(to: string | undefined, pathname: string): boolean {
  if (!to || to.includes('?')) return false;
  return pathname === to || (to !== '/' && pathname.startsWith(to + '/'));
}

/** The most recent deployment recorded for a repo (by ts), or null. Deploy events are
 *  repo-tagged (repoId); an untagged/legacy deploy simply doesn't count toward a repo. */
export function latestDeployment(s: BusState, repoId: string): Deployment | null {
  let best: Deployment | null = null;
  for (const d of s.deployments) {
    if (d.repoId !== repoId) continue;
    if (!best || d.ts > best.ts) best = d;
  }
  return best;
}
