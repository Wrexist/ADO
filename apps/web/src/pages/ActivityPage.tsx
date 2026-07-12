import { PageShell } from '../chrome/PageShell';
import { Card, FeedRow, Icon, type IconName, type Tone } from '../kit';
import { useBus } from '../store/bus';
import { timeAgo } from '../lib/time';

export function ActivityPage() {
  const state = useBus((s) => s.state);
  const items = state.activity; // newest-first, already capped in the reducer

  return (
    <PageShell title="Activity" subtitle="Everything the dashboard has recorded — scans, dispatches, builds, deployments.">
      {items.length > 0 ? (
        <Card className="mt-6 flex flex-col divide-y divide-white/[0.05] px-4 py-2">
          {items.map((a) => (
            <FeedRow
              key={a.id}
              icon={a.icon as IconName}
              tone={a.tone as Tone}
              title={a.title}
              detail={a.detail}
              time={timeAgo(a.ts)}
            />
          ))}
        </Card>
      ) : (
        <Card className="mt-6 p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3">
              <Icon name="list" size={16} />
            </span>
            <p className="text-body text-text2">No activity recorded yet</p>
            <p className="text-label text-text3">Scans, agent dispatches, and deployments will appear here.</p>
          </div>
        </Card>
      )}
      <p className="mt-8 text-label text-text3">{items.length} event{items.length === 1 ? '' : 's'}</p>
    </PageShell>
  );
}
