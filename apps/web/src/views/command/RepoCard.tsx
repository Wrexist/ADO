import { useNavigate } from 'react-router-dom';
import type { Repo } from '@ado/shared';
import {
  AvatarStack,
  Chip,
  GradientProgress,
  HoverCard,
  Icon,
  IconTile,
  StatusDot,
  cx,
} from '../../kit';
import { CATEGORY_ICON, CATEGORY_TAG, CI_TONE, REPO_STATUS_LOOK } from '../../lib/repoLook';
import { ENV_LABEL } from '../ops/maps';
import { useBus } from '../../store/bus';
import { latestDeployment } from '../../lib/selectors';
import { timeAgo } from '../../lib/time';

export function RepoCard({ repo }: { repo: Repo }) {
  const cat = CATEGORY_ICON[repo.category];
  const status = REPO_STATUS_LOOK[repo.status];
  const navigate = useNavigate();
  const deploy = useBus((s) => latestDeployment(s.state, repo.id));

  const open = () => navigate(`/repositories/${repo.id}`);

  return (
    <HoverCard
      className="flex cursor-pointer flex-col gap-3 p-4 focus-visible:ring-1 focus-visible:ring-primary/50"
      role="button"
      tabIndex={0}
      aria-label={`Open ${repo.name}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // inner buttons keep their native keyboard behavior
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
    >
      {/* header: icon · name+tag · status · automate */}
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
            aria-label={`Automate ${repo.name}`}
            title="Add an automation for this repo"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/automations?repo=${repo.id}&new=1`);
            }}
            className="rounded p-1 text-text3 transition-colors duration-150 ease-soft hover:text-primary"
          >
            <Icon name="workflow" size={14} />
          </button>
          <button
            type="button"
            aria-label={`Settings for ${repo.name}`}
            title="Project settings (features on/off)"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/repositories/${repo.id}?settings=1`);
            }}
            className="rounded p-1 text-text3 transition-colors duration-150 ease-soft hover:text-primary"
          >
            <Icon name="settings" size={14} />
          </button>
        </div>
      </div>

      <p className="truncate text-body text-text2">{repo.description}</p>

      {/* meta: branch | updated | last deploy (from real deploy events; absent = none) */}
      <div className="flex items-center gap-4 text-label text-text3">
        <span className="inline-flex items-center gap-1">
          <Icon name="branch" size={12} />
          {repo.branch}
        </span>
        <span>Updated {timeAgo(repo.updatedTs)}</span>
        {deploy ? (
          <span
            className={cx('inline-flex items-center gap-1', deploy.ok ? 'text-success' : 'text-danger')}
            title={`Last deploy: ${ENV_LABEL[deploy.env]} · ${timeAgo(deploy.ts)}`}
          >
            <Icon name="rocket" size={12} />
            {ENV_LABEL[deploy.env]}
          </span>
        ) : null}
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
