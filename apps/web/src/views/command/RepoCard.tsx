import type { Repo } from '@ado/shared';
import {
  AvatarStack,
  Chip,
  GradientProgress,
  HoverCard,
  Icon,
  IconTile,
  StatusDot,
} from '../../kit';
import { CATEGORY_ICON, CATEGORY_TAG, CI_TONE, REPO_STATUS_LOOK } from '../../lib/repoLook';
import { timeAgo } from '../../lib/time';

export function RepoCard({ repo }: { repo: Repo }) {
  const cat = CATEGORY_ICON[repo.category];
  const status = REPO_STATUS_LOOK[repo.status];

  return (
    <HoverCard className="flex flex-col gap-3 p-4">
      {/* header: icon · name+tag · status · menu */}
      <div className="flex items-start gap-3">
        <IconTile icon={cat.icon} tone={cat.tone} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text1">{repo.name}</p>
          <Chip size="sm" className="mt-1">{CATEGORY_TAG[repo.category]}</Chip>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusDot tone={status.tone} label={status.label} />
          <button
            type="button"
            aria-label={`${repo.name} options`}
            className="rounded p-1 text-text3 transition-colors duration-150 ease-soft hover:text-text1"
          >
            <Icon name="dots" size={14} />
          </button>
        </div>
      </div>

      <p className="truncate text-body text-text2">{repo.description}</p>

      {/* meta: branch | updated */}
      <div className="flex items-center gap-4 text-label text-text3">
        <span className="inline-flex items-center gap-1">
          <Icon name="branch" size={12} />
          {repo.branch}
        </span>
        <span>Updated {timeAgo(repo.updatedTs)}</span>
      </div>

      {/* progress row — pct in a reserved tabular slot; absent CI = honest state */}
      {repo.ci ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-label text-text2">{repo.ci.label}</span>
          {repo.ci.state === 'success' ? (
            <Icon name="check" size={12} className="shrink-0 text-success" />
          ) : null}
          <GradientProgress pct={repo.ci.pct} tone={CI_TONE[repo.ci.state]} />
          <span className="w-10 shrink-0 text-right text-label tabular-nums text-text2">
            {repo.ci.pct}%
          </span>
        </div>
      ) : (
        <p className="text-label text-text3">No CI runs yet</p>
      )}

      {repo.agents && repo.agents.length > 0 ? <AvatarStack ids={repo.agents} /> : null}
    </HoverCard>
  );
}
