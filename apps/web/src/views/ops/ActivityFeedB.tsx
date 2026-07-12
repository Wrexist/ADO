import { Card, FeedRow, SectionHeader, type IconName, type Tone } from '../../kit';
import { useBus } from '../../store/bus';
import { activityRecent } from '../../lib/selectors';
import { timeAgo } from '../../lib/time';

/** Col 2 — Activity Feed: every row is a stored bus event with a source id. */
export function ActivityFeedB() {
  const state = useBus((s) => s.state);
  const items = activityRecent(state, 5);

  return (
    <Card className="p-5">
      <SectionHeader title="Activity Feed" action="View all" actionTo="/activity" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
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
        {items.length === 0 ? (
          <p className="py-6 text-center text-body text-text3">No activity yet</p>
        ) : null}
      </div>
    </Card>
  );
}
