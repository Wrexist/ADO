import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Card, FeedRow, SectionHeader, type IconName, type Tone } from '../../kit';

/** Col 2 — Activity Feed: every row is (post-P2) a stored bus event with a source id. */
export function ActivityFeedB() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <SectionHeader title="Activity Feed" action="View all" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {m.activity.map((a) => (
          <FeedRow
            key={a.id}
            icon={a.icon as IconName}
            tone={a.tone as Tone}
            title={a.title}
            detail={a.detail}
            time={a.agoLabel}
          />
        ))}
      </div>
    </Card>
  );
}
