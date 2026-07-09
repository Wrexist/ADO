import { MOCK_VIEW_A } from '@ado/shared/mock';
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

/**
 * View A right rail (Prompt 1.3): AI Command Center, Recent Activity,
 * System Status, help card. 360px column.
 */
export function RightRail() {
  const m = MOCK_VIEW_A;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-4 p-6 pl-0">
      {/* AI Command Center */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">{m.commandCenter.title}</h2>
        <p className="mt-0.5 text-body text-text2">{m.commandCenter.tagline}</p>
        <div className="relative mt-4">
          <input
            type="text"
            placeholder={m.commandCenter.placeholder}
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

      {/* Recent Activity */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">Recent Activity</h2>
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
        <button
          type="button"
          className="mt-2 w-full border-t border-white/[0.05] pt-3 text-center text-body text-text2 transition-colors duration-150 ease-soft hover:text-text1"
        >
          View all activity →
        </button>
      </Card>

      {/* System Status */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">System Status</h2>
        <div className="mt-2 flex flex-col">
          {m.systemStatus.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2">
              <span className="text-body text-text2">{s.name}</span>
              <StatusDot
                dotAfter
                tone={s.state === 'operational' ? 'success' : s.state === 'degraded' ? 'warning' : 'danger'}
                label={s.state === 'operational' ? 'Operational' : s.state === 'degraded' ? 'Degraded' : 'Down'}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* help card */}
      <Card className="border-primary/25 bg-primary/10 p-5">
        <div className="flex items-center gap-3">
          <IconTile icon="sparkle" tone="violet" size="sm" />
          <div>
            <h2 className="text-body font-semibold text-text1">{m.helpCard.title}</h2>
            <p className="text-label text-text2">{m.helpCard.body}</p>
          </div>
        </div>
        <Button className="mt-4 w-full">{m.helpCard.cta}</Button>
      </Card>
    </aside>
  );
}
