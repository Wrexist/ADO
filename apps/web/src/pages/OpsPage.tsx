import { Link } from 'react-router-dom';
import { SidebarB } from '../chrome/SidebarB';
import { TopBarB } from '../chrome/TopBarB';
import { StaleBanner } from '../chrome/StaleBanner';
import { Button, Icon, RadialRing, Sparkline, StatCard } from '../kit';
import { useBus } from '../store/bus';
import {
  HEALTH_FORMULA_DOC,
  buildRows,
  rosterAgents,
  runningAgents,
  statDelta,
  systemHealthPct,
  weekDelta,
} from '../lib/selectors';
import { ProjectsOverview } from '../views/ops/ProjectsOverview';
import { BuildQueue } from '../views/ops/BuildQueue';
import { ActivityFeedB } from '../views/ops/ActivityFeedB';
import { AgentRoster } from '../views/ops/AgentRoster';
import { AssistantPanel } from '../views/ops/AssistantPanel';
import { SystemMonitor } from '../views/ops/SystemMonitor';
import { QuickActions } from '../views/ops/QuickActions';
import { RecentDeployments } from '../views/ops/RecentDeployments';

/**
 * View B — Ops Dashboard (/ops), rendering exclusively from the bus store.
 * Stat sparklines for agent-count / health history show the flat "collecting data"
 * line until the 2.4 snapshot jobs produce a real series — never an invented curve.
 */
export function OpsPage() {
  const state = useBus((s) => s.state);

  const repoCount = Object.keys(state.repos).length;
  const builds = buildRows(state);
  const runningBuilds = builds.filter((b) => b.state === 'running').length;
  const agentsTotal = Object.keys(state.agents).length;
  const running = runningAgents(state).length;
  const roster = rosterAgents(state).length;
  const health = systemHealthPct(state);
  const agentSeries = (state.statHistory.agentsActive ?? []).map((p) => p.value);
  const allWell =
    health != null && health >= 95
      ? 'Everything looks great.'
      : health == null
        ? 'Collecting data.'
        : 'Some systems need attention.';

  return (
    <div className="min-h-screen min-w-[1280px] bg-app text-text1">
      <TopBarB />
      <StaleBanner />
      <div className="flex items-stretch">
        <SidebarB />
        <main className="min-w-0 flex-1 p-6">
          {/* header — copy single-shot; the count is derived */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-title font-semibold text-text1">Operations 👋</h1>
              <p className="mt-1 text-body text-text2">
                {allWell} {repoCount} projects active.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/repositories?add=1">
                <Button>
                  <Icon name="plus" size={14} />
                  Add project
                </Button>
              </Link>
              <Link to="/prompts">
                <Button variant="outline">
                  <Icon name="sparkle" size={14} />
                  Prompt Library
                </Button>
              </Link>
            </div>
          </div>

          {/* stat cards ×5 — all derived from the store */}
          <div className="mt-6 grid grid-cols-5 gap-4">
            <StatCard
              label="Repositories"
              value={String(repoCount)}
              delta={weekDelta(statDelta(repoCount, state.statHistory.repos))}
              icon="github"
              iconTone="violet"
            />
            <StatCard
              label="Active Builds"
              value={String(runningBuilds)}
              sub="Running now"
              visual={
                builds.length > 0 ? (
                  <RadialRing value={runningBuilds} max={builds.length} tone="violet" />
                ) : undefined
              }
            />
            <StatCard
              label="AI Agents"
              value={String(agentsTotal)}
              sub={`${running} running · ${roster} configured`}
              subDotTone="success"
              // Real active-agent series once ≥2 daily snapshots exist; flat until then.
              visual={<Sparkline points={agentSeries.length >= 2 ? agentSeries : []} tone="success" width={80} height={30} />}
            />
            <StatCard
              label="Deployments"
              value={String(state.deployments.length)}
              delta={weekDelta(statDelta(state.deployments.length, state.statHistory.deployments))}
              icon="cloud"
              iconTone="info"
            />
            <StatCard
              label="System Health"
              info={HEALTH_FORMULA_DOC}
              value={health != null ? `${health}%` : '—'}
              sub={
                health == null
                  ? 'no data yet'
                  : health >= 95
                    ? 'Excellent'
                    : health >= 80
                      ? 'Good'
                      : 'Degraded'
              }
              tinted={health != null && health >= 95 ? 'success' : undefined}
              icon="health"
              iconTone="success"
            />
          </div>

          {/* 5 / 4 / 3 column grid */}
          <div className="mt-6 grid grid-cols-12 items-start gap-4">
            <div className="col-span-5 flex flex-col gap-4">
              <ProjectsOverview />
              <BuildQueue />
            </div>
            <div className="col-span-4 flex flex-col gap-4">
              <ActivityFeedB />
              <AgentRoster />
            </div>
            <div className="col-span-3 flex flex-col gap-4">
              <AssistantPanel />
              <SystemMonitor />
              <QuickActions />
              <RecentDeployments />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
