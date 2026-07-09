import type { RepoCardFixture, RepoCategory } from '@ado/shared/mock';
import {
  AvatarStack,
  Chip,
  GradientProgress,
  HoverCard,
  Icon,
  IconTile,
  StatusDot,
  type IconName,
  type Tone,
} from '../../kit';

/** Category → icon tile look (data decides the category; the map is presentation). */
const CATEGORY_ICON: Record<RepoCategory, { icon: IconName; tone: Tone }> = {
  game: { icon: 'games', tone: 'violet' },
  app: { icon: 'sparkle', tone: 'success' },
  web: { icon: 'cloud', tone: 'info' },
  api: { icon: 'code', tone: 'violet' },
  library: { icon: 'templates', tone: 'warning' },
  service: { icon: 'database', tone: 'info' },
};

const STATUS: Record<RepoCardFixture['status'], { tone: Tone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  testing: { tone: 'warning', label: 'Testing' },
  blocked: { tone: 'danger', label: 'Blocked' },
  archived: { tone: 'muted', label: 'Archived' },
};

const PROGRESS_TONE: Record<RepoCardFixture['progress']['state'], 'gradient' | Tone> = {
  success: 'gradient',
  running: 'warning',
  queued: 'warning',
  failed: 'danger',
};

export function RepoCard({ repo }: { repo: RepoCardFixture }) {
  const cat = CATEGORY_ICON[repo.category];
  const status = STATUS[repo.status];

  return (
    <HoverCard className="flex flex-col gap-3 p-4">
      {/* header: icon · name+tag · status · menu */}
      <div className="flex items-start gap-3">
        <IconTile icon={cat.icon} tone={cat.tone} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text1">{repo.name}</p>
          <Chip size="sm" className="mt-1">{repo.tagLabel}</Chip>
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
        <span>Updated {repo.updatedLabel}</span>
      </div>

      {/* progress row — pct sits in a reserved tabular slot (no reflow) */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-label text-text2">{repo.progress.label}</span>
        {repo.progress.state === 'success' ? (
          <Icon name="check" size={12} className="shrink-0 text-success" />
        ) : null}
        <GradientProgress pct={repo.progress.pct} tone={PROGRESS_TONE[repo.progress.state]} />
        <span className="w-10 shrink-0 text-right text-label tabular-nums text-text2">
          {repo.progress.pct}%
        </span>
      </div>

      <AvatarStack ids={repo.agents} overflow={repo.agentsOverflow} />
    </HoverCard>
  );
}
