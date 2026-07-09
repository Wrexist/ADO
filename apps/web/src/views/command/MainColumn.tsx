import { useState } from 'react';
import { MOCK_VIEW_A } from '@ado/shared/mock';
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
import { RepoCard } from './RepoCard';

/**
 * View A main column (Prompt 1.2): header row, 4 stat cards, All Repositories
 * (tabs + 3×2 grid + view-all bar), Running Agents strip. All values from
 * @ado/shared/mock — replaced by Zustand slices in Phase 2.
 */

const TAB_CATEGORY: Record<string, string | null> = {
  all: null,
  games: 'game',
  apps: 'app',
  libraries: 'library',
};

export function MainColumn() {
  const m = MOCK_VIEW_A;
  const [tab, setTab] = useState('all');
  const category = TAB_CATEGORY[tab] ?? null;
  const repos = (category ? m.repos.filter((r) => r.category === category) : m.repos).slice(0, 6);

  return (
    <main className="min-w-[640px] flex-1 p-6">
      {/* header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-title font-semibold text-text1">{m.header.greeting}</h1>
          <p className="mt-1 text-body text-text2">{m.header.subtitle}</p>
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

      {/* stat cards */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        {m.stats.map((s) => (
          <StatCard
            key={s.id}
            label={s.label}
            value={s.value}
            delta={s.delta}
            sub={s.sub}
            subDotTone={s.id === 'active-agents' ? 'success' : undefined}
            icon={s.icon as IconName}
            iconTone={s.iconTone as Tone}
          />
        ))}
      </div>

      {/* all repositories */}
      <div className="mt-8">
        <div className="flex items-center gap-4">
          <h2 className="shrink-0 text-section font-semibold text-text1">All Repositories</h2>
          <PillTabs tabs={m.repoTabs} activeId={tab} onChange={setTab} />
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
          {repos.map((r) => (
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

      {/* running agents */}
      <div className="mt-8">
        <SectionHeader title="Running Agents" action="View all agents" />
        <div className="mt-4 grid grid-cols-5 gap-3">
          {m.runningAgents.map((a) => (
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
