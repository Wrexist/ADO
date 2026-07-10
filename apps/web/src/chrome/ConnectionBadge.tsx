import { StatusDot } from '../kit';
import { useBus } from '../store/bus';

/**
 * Live-connection indicator (council S5): the UI must never present stale data as
 * live. Anything but 'live' is announced — including "no token yet" (offline).
 */
const LOOK = {
  live: { tone: 'success', label: 'Live' },
  connecting: { tone: 'muted', label: 'Connecting…' },
  reconnecting: { tone: 'warning', label: 'Reconnecting — stale' },
  offline: { tone: 'danger', label: 'Offline' },
} as const;

export function ConnectionBadge() {
  const connection = useBus((s) => s.connection);
  const look = LOOK[connection];
  return (
    <span className="flex h-9 items-center rounded-full border bg-card px-3">
      <StatusDot tone={look.tone} label={look.label} />
    </span>
  );
}
