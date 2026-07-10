import { useState } from 'react';
import { tokens } from '@ado/shared';
import { Card, Chip, Icon, IconTile, PillTabs } from '../../kit';
import { useBus } from '../../store/bus';
import { projectStatus, reposList } from '../../lib/selectors';
import { CATEGORY_ICON } from '../../lib/repoLook';
import { LANG_LABEL, PROJECT_STATUS_TONE } from './maps';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'repositories', label: 'Repositories' },
  { id: 'games', label: 'Games' },
  { id: 'apps', label: 'Apps' },
  { id: 'services', label: 'Services' },
];

const TAB_CATEGORY: Record<string, string | null> = {
  all: null,
  repositories: null,
  games: 'game',
  apps: 'app',
  services: 'service',
};

/** Col 1 — Projects Overview: rows derived from the repos slice. */
export function ProjectsOverview() {
  const state = useBus((s) => s.state);
  const [tab, setTab] = useState('repositories');
  const category = TAB_CATEGORY[tab] ?? null;
  const rows = (category
    ? reposList(state).filter((r) => r.category === category)
    : reposList(state)
  ).slice(0, 5);

  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">Projects Overview</h2>
      <PillTabs tabs={TABS} activeId={tab} onChange={setTab} className="mt-3" />

      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {rows.map((p) => {
          const tile = CATEGORY_ICON[p.category];
          const status = projectStatus(p);
          return (
            <div key={p.id} className="flex items-center gap-2.5 py-3">
              <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-text1">{p.name}</p>
                <p className="truncate text-label text-text3">{p.description}</p>
              </div>

              <span className="flex w-[76px] shrink-0 items-center gap-1.5 text-label text-text2">
                {p.language ? (
                  <>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tokens.language[p.language] }}
                    />
                    <span className="truncate">{LANG_LABEL[p.language]}</span>
                  </>
                ) : (
                  <span className="text-text3">—</span>
                )}
              </span>

              <span className="flex w-10 shrink-0 items-center gap-1 text-label tabular-nums text-text3">
                <Icon name="star" size={11} />
                {p.stars ?? '—'}
              </span>
              <span className="flex w-9 shrink-0 items-center gap-1 text-label tabular-nums text-text3">
                <Icon name="branch" size={11} />
                {p.prs ?? '—'}
              </span>

              {status ? (
                <Chip tone={PROJECT_STATUS_TONE[status.kind]} dot size="sm" className="tabular-nums">
                  {status.label}
                  {status.detail ? ` ${status.detail}` : ''}
                </Chip>
              ) : (
                <Chip size="sm">No CI</Chip>
              )}

              <button
                type="button"
                aria-label={`${p.name} options`}
                className="rounded p-1 text-text3 transition-colors duration-150 ease-soft hover:text-text1"
              >
                <Icon name="dots" size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="mt-1 w-full border-t border-white/[0.05] pt-3 text-center text-body text-text2 transition-colors duration-150 ease-soft hover:text-text1"
      >
        View all repositories
      </button>
    </Card>
  );
}
