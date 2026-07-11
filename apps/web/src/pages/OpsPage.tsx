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
  systemHealthPct,
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
              <h1 className="text-title font-semibold text-text1">Good morning, Isac 👋</h1>
              <p className="mt-1 text-body text-text2">
                {allWell} {repoCount} projects active.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button>New Project</Button>
              <Button variant="outline">
                <Icon name="sparkle" size={14} />
                AI Assistant
              </Button>
            </div>
          </div>

          {/* stat cards ×5 — all derived from the store */}
          <div className="mt-6 grid grid-cols-5 gap-4">
            <StatCard label="Repositories" value={String(repoCount)} icon="github" iconTone="violet" />
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
              visual={<Sparkline points={[]} tone="success" width={80} height={30} />}
            />
            <StatCard
              label="Deployments"
              value={String(state.deployments.length)}
              icon="cloud"
              iconTone="info"
            />
            <div title={HEALTH_FORMULA_DOC}>
              <StatCard
                label="System Health"
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
                visual={<Sparkline points={[]} tone="success" width={80} height={30} />}
              />
            </div>
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
