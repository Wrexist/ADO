import { useState } from 'react';
import { MOCK_VIEW_B } from '@ado/shared/mock';
import { tokens } from '@ado/shared';
import { Card, Chip, Icon, IconTile, PillTabs } from '../../kit';
import { LANG_LABEL, PROJECT_ICON, PROJECT_ICON_FALLBACK, STATUS_TONE } from './maps';

/** Col 1 — Projects Overview: tabs + rows (icon, name, language dot, ★, ⑂, status chip). */
export function ProjectsOverview() {
  const m = MOCK_VIEW_B;
  const [tab, setTab] = useState('repositories');
  const tabs = m.projectTabs.map((t) => ({ id: t.toLowerCase(), label: t }));

  return (
    <Card className="p-5">
      <h2 className="text-section font-semibold text-text1">Projects Overview</h2>
      <PillTabs tabs={tabs} activeId={tab} onChange={setTab} className="mt-3" />

      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {m.projects.map((p) => {
          const tile = PROJECT_ICON[p.id] ?? PROJECT_ICON_FALLBACK;
          return (
            <div key={p.id} className="flex items-center gap-2.5 py-3">
              <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-text1">{p.name}</p>
                <p className="truncate text-label text-text3">{p.subtitle}</p>
              </div>

              <span className="flex w-[76px] shrink-0 items-center gap-1.5 text-label text-text2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tokens.language[p.language] }}
                />
                <span className="truncate">{LANG_LABEL[p.language]}</span>
              </span>

              <span className="flex w-10 shrink-0 items-center gap-1 text-label tabular-nums text-text3">
                <Icon name="star" size={11} />
                {p.stars}
              </span>
              <span className="flex w-9 shrink-0 items-center gap-1 text-label tabular-nums text-text3">
                <Icon name="branch" size={11} />
                {p.prs}
              </span>

              <Chip tone={STATUS_TONE[p.status.kind]} dot size="sm" className="tabular-nums">
                {p.status.label}
                {p.status.detail ? ` ${p.status.detail}` : ''}
              </Chip>

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
