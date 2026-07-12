import { useBus } from '../store/bus';

/**
 * Honest offline/stale banner (gate p2: "killing the server puts the UI in an honest
 * offline/stale state"). When the stream isn't live, everything on screen is a frozen
 * last-known snapshot — say so rather than letting stale values masquerade as live.
 */
const MESSAGE = {
  reconnecting: 'Connection lost — reconnecting. Values below are the last known state, not live.',
  offline: 'Server offline — no token configured or the server isn’t running. Showing no live data.',
  connecting: 'Connecting to the live data stream…',
} as const;

export function StaleBanner() {
  const connection = useBus((s) => s.connection);
  if (connection === 'live') return null;
  const tone = connection === 'offline' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning';
  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-label font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {MESSAGE[connection]}
    </div>
  );
}
