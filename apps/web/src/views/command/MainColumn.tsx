import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { repoTabs, runningAgents, statDelta, weekDelta } from '../../lib/selectors';
import { approxTokens } from '../../lib/time';
import { RepoCard } from './RepoCard';

/**
 * View A main column — renders EXCLUSIVELY from the bus store (Prompt 2.1).
 * Deltas ("↑2 this week") come from stored daily snapshots (stats.snapshot): no
 * history → no delta, never an invented one (DATA_MAP rule).
 */

const TAB_CATEGORY: Record<string, string | null> = {
  all: null,
  games: 'game',
  apps: 'app',
  libraries: 'library',
};

const STATUS_ORDER: Record<string, number> = { active: 0, testing: 1, blocked: 2, archived: 3 };
const SORTS = [
  { id: 'recent', label: 'Recently Updated' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'status', label: 'Status' },
] as const;
type SortId = (typeof SORTS)[number]['id'];
type Layout = 'grid' | 'comfortable' | 'list';
const GRID_COLS: Record<Layout, string> = { grid: 'grid-cols-3', comfortable: 'grid-cols-2', list: 'grid-cols-1' };
const LAYOUTS: Array<{ icon: IconName; mode: Layout }> = [
  { icon: 'grid', mode: 'grid' },
  { icon: 'list', mode: 'list' },
  { icon: 'overview', mode: 'comfortable' },
];

export function MainColumn() {
  const state = useBus((s) => s.state);
  const [tab, setTab] = useState('all');
  const [layout, setLayout] = useState<Layout>('grid');
  const [sort, setSort] = useState<SortId>('recent');
  const [sortOpen, setSortOpen] = useState(false);

  const tabs = repoTabs(state);
  const running = runningAgents(state);
  const agentsTotal = Object.keys(state.agents).length;
  const category = TAB_CATEGORY[tab] ?? null;

  // Repositories sorted by the chosen key (all real fields; no fabricated ordering).
  const repos = useMemo(() => {
    const arr = Object.values(state.repos);
    if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'status') arr.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    else arr.sort((a, b) => b.updatedTs.localeCompare(a.updatedTs));
    return arr;
  }, [state.repos, sort]);
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
            {LAYOUTS.map(({ icon, mode }) => (
              <button
                key={mode}
                type="button"
                aria-label={`${mode} layout`}
                aria-pressed={layout === mode}
                onClick={() => setLayout(mode)}
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150 ease-soft',
                  layout === mode ? 'bg-primary/20 text-primary' : 'text-text3 hover:text-text1',
                )}
              >
                <Icon name={icon} size={14} />
              </button>
            ))}
          </div>
          <Link to="/planned/new-project">
            <Button>
              <Icon name="plus" size={14} />
              New
            </Button>
          </Link>
        </div>
      </div>

      {/* stat cards — every value derived from the store */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard
          label="Total Repositories"
          value={String(repos.length)}
          delta={weekDelta(statDelta(repos.length, state.statHistory.repos))}
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
          delta={weekDelta(statDelta(state.deployments.length, state.statHistory.deployments))}
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
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setSortOpen((o) => !o)}>
                Sort: {SORTS.find((s) => s.id === sort)?.label}
                <Icon name="chevronDown" size={13} />
              </Button>
              {sortOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-tile border bg-panel p-1">
                    {SORTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSort(s.id);
                          setSortOpen(false);
                        }}
                        className={cx(
                          'block w-full rounded px-2.5 py-1.5 text-left text-body transition-colors duration-150 ease-soft',
                          sort === s.id ? 'bg-elevated text-text1' : 'text-text2 hover:bg-elevated/60',
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Toggle grid/list"
              className="px-2.5"
              onClick={() => setLayout((l) => (l === 'list' ? 'grid' : 'list'))}
            >
              <Icon name={layout === 'list' ? 'list' : 'grid'} size={14} />
            </Button>
          </div>
        </div>

        <div className={cx('mt-4 grid gap-4', GRID_COLS[layout])}>
          {visible.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>

        <Link
          to="/repositories"
          className="mt-4 block w-full rounded-card border bg-card py-2.5 text-center text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
        >
          View all repositories →
        </Link>
      </div>

      {/* running agents — live runner processes only */}
      <div className="mt-8">
        <SectionHeader title="Running Agents" action="View all agents" actionTo="/agents" />
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
