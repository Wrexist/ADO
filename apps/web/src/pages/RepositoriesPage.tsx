import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RepoCategory } from '@ado/shared';
import { Card, Icon, cx } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { reposList } from '../lib/selectors';
import { RepoCard } from '../views/command/RepoCard';

const CATS: Array<{ id: RepoCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'game', label: 'Games' },
  { id: 'app', label: 'Apps' },
  { id: 'web', label: 'Web' },
  { id: 'api', label: 'API' },
  { id: 'service', label: 'Services' },
  { id: 'library', label: 'Libraries' },
];

export function RepositoriesPage() {
  const state = useBus((s) => s.state);
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? 'all';
  const [query, setQuery] = useState('');
  const repos = reposList(state);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of repos) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [repos]);

  const q = query.trim().toLowerCase();
  const visible = repos.filter(
    (r) =>
      (cat === 'all' || r.category === cat) &&
      (!q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)),
  );

  return (
    <PageShell title="Repositories" subtitle="Every repository the dashboard is tracking, from the scanner and GitHub.">
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATS.map((c) => {
            const active = cat === c.id;
            const n = c.id === 'all' ? repos.length : counts.get(c.id) ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setParams(c.id === 'all' ? {} : { cat: c.id })}
                className={cx(
                  'rounded-full px-3 py-1.5 text-body transition-colors duration-150 ease-soft',
                  active ? 'bg-primary/15 font-medium text-text1' : 'bg-card text-text2 hover:text-text1',
                )}
              >
                {c.label}
                <span className="tabular-nums text-text3"> ({n})</span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto max-w-xs flex-1">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter repositories…"
            aria-label="Filter repositories"
            className="h-9 w-full rounded-tile border bg-card pl-9 pr-3 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none"
          />
        </div>
      </div>

      {visible.length > 0 ? (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {visible.map((r) => (
            <RepoCard key={r.id} repo={r} />
          ))}
        </div>
      ) : (
        <Card className="mt-6 p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3">
              <Icon name="repos" size={16} />
            </span>
            <p className="text-body text-text2">
              {repos.length === 0 ? 'No repositories yet' : 'No repositories match'}
            </p>
            <p className="text-label text-text3">
              {repos.length === 0
                ? 'Set PROJECT_DIRS or connect GitHub in Settings to populate this.'
                : 'Try another category or clear the filter.'}
            </p>
          </div>
        </Card>
      )}

      <p className="mt-8 text-label text-text3">{visible.length} shown · {repos.length} total</p>
    </PageShell>
  );
}
