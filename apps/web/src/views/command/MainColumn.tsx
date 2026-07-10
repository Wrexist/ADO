import { useState } from 'react';
import {
  AgentTile,
  Button,
  Icon,
  PillTabs,
  SectionHeader,
  StatCard,
  cx,
  type IconName,
  type Tone,
} from '../../kit';
import { useBus } from '../../store/bus';
import { reposList, repoTabs, runningAgents } from '../../lib/selectors';
import { approxTokens } from '../../lib/time';
import { RepoCard } from './RepoCard';

/**
 * View A main column — renders EXCLUSIVELY from the bus store (Prompt 2.1).
 * Deltas ("↑2 this week") are hidden until daily snapshots exist (2.4): no
 * history → no delta, never an invented one (DATA_MAP rule).
 */

const TAB_CATEGORY: Record<string, string | null> = {
  all: null,
  games: 'game',
  apps: 'app',
  libraries: 'library',
};

export function MainColumn() {
  const state = useBus((s) => s.state);
  const [tab, setTab] = useState('all');

  const repos = reposList(state);
  const tabs = repoTabs(state);
  const running = runningAgents(state);
  const agentsTotal = Object.keys(state.agents).length;
  const category = TAB_CATEGORY[tab] ?? null;
  const visible = (category ? repos.filter((r) => r.category === category) : repos).slice(0, 6);

  return (
    <main className="min-w-[640px] flex-1 p-6">
      {/* header row — copy is a single-shot draft (convention 6) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-semibold text-text1">Welcome back, Isac! 👋</h1>
          <p className="mt-1 text-body text-text2">
            Here's what's happening with your projects today.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-tile border bg-card p-1">
            {(['grid', 'list', 'overview'] as IconName[]).map((icon, i) => (
              <button
                key={icon}
                type="button"
                aria-label={`Layout ${icon}`}
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ease-soft',
                  i === 0 ? 'bg-primary/20 text-primary' : 'text-text3 hover:text-text1',
                )}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
          <Button>
            <Icon name="plus" size={14} />
            New
          </Button>
        </div>
      </div>

      {/* stat cards — every value derived from the store */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard
          label="Total Repositories"
          value={String(repos.length)}
          icon="repos"
          iconTone="violet"
        />
        <StatCard
          label="Active Agents"
          value={String(agentsTotal)}
          sub={`${running.length} running`}
          subDotTone="success"
          icon="agents"
          iconTone="success"
        />
        <StatCard
          label="Deployments"
          value={String(state.deployments.length)}
          icon="rocket"
          iconTone="info"
        />
        <StatCard
          label="AI Tokens Used"
          value={approxTokens(state.tokens?.approxTokens ?? null)}
          sub={state.tokens?.approxTokens != null ? `last ${state.tokens.windowLabel}` : 'tokens unavailable'}
          icon="tokens"
          iconTone="warning"
        />
      </div>

      {/* all repositories */}
      <div className="mt-8">
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-section font-semibold text-text1">All Repositories</h2>
          <PillTabs tabs={tabs} activeId={tab} onChange={setTab} />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm">
              Sort: Recently Updated
              <Icon name="chevronDown" size={13} />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Grid view" className="px-2.5">
              <Icon name="grid" size={14} />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          {visible.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-card border bg-card py-2.5 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
        >
          View all repositories →
        </button>
      </div>

      {/* running agents — live runner processes only */}
      <div className="mt-8">
        <SectionHeader title="Running Agents" action="View all agents" />
        <div className="mt-4 grid grid-cols-5 gap-3">
          {running.map((a) => (
            <AgentTile
              key={a.id}
              icon={a.icon as IconName}
              name={a.name}
              statusLine={a.statusLine}
              pct={a.pct}
              tone={a.tone as Tone}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
