import { Card, Chip, Icon, SectionHeader } from '../../kit';
import { useBus } from '../../store/bus';
import { recentDeployments } from '../../lib/selectors';
import { timeAgo } from '../../lib/time';
import { ENV_LABEL, ENV_TONE } from './maps';

/** Col 3 — Recent Deployments from the deployments slice. */
export function RecentDeployments() {
  const state = useBus((s) => s.state);
  const rows = recentDeployments(state, 3);

  return (
    <Card className="p-5">
      <SectionHeader title="Recent Deployments" action="View all" actionTo="/deployments" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {rows.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5 py-3">
            <p className="min-w-0 flex-1 truncate text-body font-medium text-text1">{d.name}</p>
            <Chip tone={ENV_TONE[d.env]} size="sm">{ENV_LABEL[d.env]}</Chip>
            <span className="w-12 shrink-0 text-right text-label tabular-nums text-text3">
              {timeAgo(d.ts)}
            </span>
            {d.ok ? (
              <Icon name="check" size={14} className="shrink-0 text-success" />
            ) : (
              <Icon name="bell" size={14} className="shrink-0 text-danger" />
            )}
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-body text-text3">No deployments yet</p>
        ) : null}
      </div>
    </Card>
  );
}
