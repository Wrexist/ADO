import {
  Button,
  Card,
  FeedRow,
  Icon,
  IconTile,
  StatusDot,
  type IconName,
  type Tone,
} from '../../kit';
import { useBus } from '../../store/bus';
import { activityRecent, systemStatusRows } from '../../lib/selectors';
import { timeAgo } from '../../lib/time';

const STATE_LOOK = {
  operational: { tone: 'success', label: 'Operational' },
  degraded: { tone: 'warning', label: 'Degraded' },
  down: { tone: 'danger', label: 'Down' },
  unknown: { tone: 'muted', label: 'No data' },
} as const;

/** View A right rail — activity + status straight from the bus store. */
export function RightRail() {
  const state = useBus((s) => s.state);
  const activity = activityRecent(state, 6);
  const status = systemStatusRows(state);

  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-4 p-6 pl-0">
      {/* AI Command Center — input wired to intents in Phase 4 */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">AI Command Center</h2>
        <p className="mt-0.5 text-body text-text2">Ask anything. AI will handle it.</p>
        <div className="relative mt-4">
          <input
            type="text"
            placeholder="What do you want to build or fix?"
            className="h-10 w-full rounded-tile border-none bg-elevated pl-3 pr-12 text-body text-text1 placeholder:text-text3 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            type="button"
            aria-label="Send command"
            className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-primary text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85"
          >
            <Icon name="send" size={13} />
          </button>
        </div>
      </Card>

      {/* Recent Activity — stored bus events only */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">Recent Activity</h2>
        <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
          {activity.map((a) => (
            <FeedRow
              key={a.id}
              icon={a.icon as IconName}
              tone={a.tone as Tone}
              title={a.title}
              detail={a.detail}
              time={timeAgo(a.ts)}
            />
          ))}
          {activity.length === 0 ? (
            <p className="py-6 text-center text-body text-text3">No activity yet</p>
          ) : null}
        </div>
        <button
          type="button"
          className="mt-2 w-full border-t border-white/[0.05] pt-3 text-center text-body text-text2 transition-colors duration-150 ease-soft hover:text-text1"
        >
          View all activity →
        </button>
      </Card>

      {/* System Status — health-check events; unknown is honest */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">System Status</h2>
        <div className="mt-2 flex flex-col">
          {status.map((s) => {
            const look = STATE_LOOK[s.state];
            return (
              <div key={s.id} className="flex items-center justify-between py-2">
                <span className="text-body text-text2">{s.name}</span>
                <StatusDot dotAfter tone={look.tone} label={look.label} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* help card */}
      <Card className="border-primary/25 bg-primary/10 p-5">
        <div className="flex items-center gap-3">
          <IconTile icon="sparkle" tone="violet" size="sm" />
          <div>
            <h2 className="text-body font-semibold text-text1">Need help?</h2>
            <p className="text-label text-text2">AI Assistant is ready to help you</p>
          </div>
        </div>
        <Button className="mt-4 w-full">Open AI Assistant</Button>
      </Card>
    </aside>
  );
}
