import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Card, Chip, Icon, SectionHeader } from '../../kit';
import { ENV_TONE } from './maps';

/** Col 3 — Recent Deployments: name + env chip + time + result check. */
export function RecentDeployments() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <SectionHeader title="Recent Deployments" action="View all" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {m.deployments.map((d) => (
          <div key={d.id} className="flex items-center gap-2.5 py-3">
            <p className="min-w-0 flex-1 truncate text-body font-medium text-text1">{d.name}</p>
            <Chip tone={ENV_TONE[d.env]} size="sm">{d.envLabel}</Chip>
            <span className="w-12 shrink-0 text-right text-label tabular-nums text-text3">
              {d.agoLabel}
            </span>
            <Icon name="check" size={14} className="shrink-0 text-success" />
          </div>
        ))}
      </div>
    </Card>
  );
}
