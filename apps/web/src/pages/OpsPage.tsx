import type { ReactNode } from 'react';
import { MOCK_VIEW_B, type StatCardFixture } from '@ado/shared/mock';
import { SidebarB } from '../chrome/SidebarB';
import { TopBarB } from '../chrome/TopBarB';
import { Button, Icon, RadialRing, Sparkline, StatCard, type Tone } from '../kit';
import { ProjectsOverview } from '../views/ops/ProjectsOverview';
import { BuildQueue } from '../views/ops/BuildQueue';
import { ActivityFeedB } from '../views/ops/ActivityFeedB';
import { AgentRoster } from '../views/ops/AgentRoster';
import { AssistantPanel } from '../views/ops/AssistantPanel';
import { SystemMonitor } from '../views/ops/SystemMonitor';
import { QuickActions } from '../views/ops/QuickActions';
import { RecentDeployments } from '../views/ops/RecentDeployments';
import { asIcon } from '../views/ops/maps';

/**
 * View B — Ops Dashboard (/ops). Prompt 1.4: top bar + sidebar variant, 5 stat cards
 * (radial with explicit denominator, real-series sparklines), and the 5/4/3 column
 * grid — all composed from the kit on per-view mock data.
 */

/** Chart node from fixture data — the fixture decides kind/points/denominator. */
function statVisual(s: StatCardFixture): ReactNode | undefined {
  if (!s.chart) return undefined;
  if (s.chart.kind === 'radial') {
    return <RadialRing value={s.chart.value} max={s.chart.max} tone={s.chart.tone as Tone} />;
  }
  return <Sparkline points={s.chart.points} tone={s.chart.tone as Tone} width={80} height={30} />;
}

export function OpsPage() {
  const m = MOCK_VIEW_B;

  return (
    <div className="min-h-screen min-w-[1280px] bg-app text-text1">
      <TopBarB />
      <div className="flex items-stretch">
        <SidebarB />
        <main className="min-w-0 flex-1 p-6">
          {/* header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-title font-semibold text-text1">{m.header.greeting}</h1>
              <p className="mt-1 text-body text-text2">{m.header.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button>New Project</Button>
              <Button variant="outline">
                <Icon name="sparkle" size={14} />
                AI Assistant
              </Button>
            </div>
          </div>

          {/* stat cards ×5 */}
          <div className="mt-6 grid grid-cols-5 gap-4">
            {m.stats.map((s) => (
              <StatCard
                key={s.id}
                label={s.label}
                value={s.value}
                delta={s.delta}
                sub={s.sub}
                subDotTone={s.id === 'ai-agents' ? 'success' : undefined}
                icon={s.chart ? undefined : asIcon(s.icon)}
                iconTone={s.iconTone as Tone}
                visual={statVisual(s)}
                tinted={s.id === 'system-health' ? 'success' : undefined}
              />
            ))}
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
