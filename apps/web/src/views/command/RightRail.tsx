import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  FeedRow,
  IconTile,
  StatusDot,
  type IconName,
  type Tone,
} from '../../kit';
import { useBus } from '../../store/bus';
import { activityRecent, systemStatusRows } from '../../lib/selectors';
import { timeAgo } from '../../lib/time';
import { CommandBox } from './CommandBox';

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
  const [focusCmd, setFocusCmd] = useState(0);
  const [seed, setSeed] = useState<{ text: string; n: number }>();

  // Suggestion chips teach the box what it can actually do (the 5 real intents), with a
  // live repo name when one exists. Clicking prefills (never auto-runs) the box.
  const firstRepo = Object.values(state.repos)[0]?.id;
  const suggestions = [
    'status',
    'summarize recent activity',
    ...(firstRepo ? [`gate status of ${firstRepo}`] : []),
  ];
  const suggest = (text: string) => setSeed((s) => ({ text, n: (s?.n ?? 0) + 1 }));

  return (
    <aside className="flex w-[360px] shrink-0 flex-col gap-4 p-6 pl-0">
      {/* AI Command Center — natural language → intent → action (Phase 4) */}
      <Card className="p-5">
        <h2 className="text-section font-semibold text-text1">AI Command Center</h2>
        <p className="mt-0.5 text-body text-text2">Ask about status, or create and dispatch a task.</p>
        <div className="mt-4">
          <CommandBox placeholder="e.g. status · fix the flaky test in …" seed={seed} focusSignal={focusCmd} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => suggest(s)}
              className="rounded-full border bg-elevated px-2.5 py-1 text-label text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
            >
              {s}
            </button>
          ))}
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
        <Link
          to="/activity"
          className="mt-2 block w-full border-t border-white/[0.05] pt-3 text-center text-body text-text2 transition-colors duration-150 ease-soft hover:text-text1"
        >
          View all activity →
        </Link>
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
            <p className="text-label text-text2">Jump to the command box and ask</p>
          </div>
        </div>
        <Button className="mt-4 w-full" onClick={() => setFocusCmd((n) => n + 1)}>
          Ask the command center
        </Button>
      </Card>
    </aside>
  );
}
