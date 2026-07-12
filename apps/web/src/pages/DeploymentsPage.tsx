import { PageShell } from '../chrome/PageShell';
import { Card, Chip, Icon } from '../kit';
import { useBus } from '../store/bus';
import { recentDeployments } from '../lib/selectors';
import { timeAgo } from '../lib/time';
import { ENV_LABEL, ENV_TONE } from '../views/ops/maps';

export function DeploymentsPage() {
  const state = useBus((s) => s.state);
  const rows = recentDeployments(state, 50);

  return (
    <PageShell title="Deployments" subtitle="Releases and deployments recorded from GitHub and the runner.">
      {rows.length > 0 ? (
        <Card className="mt-6 flex flex-col divide-y divide-white/[0.05] p-2">
          {rows.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-3">
              <Icon name="rocket" size={15} className="shrink-0 text-text3" />
              <p className="min-w-0 flex-1 truncate text-body font-medium text-text1">{d.name}</p>
              <Chip tone={ENV_TONE[d.env]} size="sm">{ENV_LABEL[d.env]}</Chip>
              <span className="w-14 shrink-0 text-right text-label tabular-nums text-text3">{timeAgo(d.ts)}</span>
              {d.ok ? (
                <Icon name="check" size={14} className="shrink-0 text-success" />
              ) : (
                <Icon name="bell" size={14} className="shrink-0 text-danger" />
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Card className="mt-6 p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3">
              <Icon name="rocket" size={16} />
            </span>
            <p className="text-body text-text2">No deployments yet</p>
            <p className="text-label text-text3">Connect GitHub in Settings — releases record here.</p>
          </div>
        </Card>
      )}
      <p className="mt-8 text-label text-text3">{rows.length} deployment{rows.length === 1 ? '' : 's'}</p>
    </PageShell>
  );
}
