import { useBus } from '../store/bus';
import { useEffect, useState } from 'react';
import { ACC_TOKEN, SERVER_URL } from '../lib/config';

function RecoveryBanner() {
  const connection = useBus((s) => s.connection);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!ACC_TOKEN) return;
    const controller = new AbortController();
    void fetch(`${SERVER_URL}/api/recovery`, { headers: { 'x-acc-token': ACC_TOKEN }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Recovery status unavailable');
        const state = await response.json() as { recovery?: { mode?: string } | null; message?: string };
        if (!controller.signal.aborted) setMessage(state.recovery?.mode === 'review' ? state.message ?? 'Recovery review mode: jobs and changes are paused.' : null);
      }).catch(() => { /* Keep an already known recovery warning during disconnection. */ });
    return () => controller.abort();
  }, [connection]);
  return message ? <div role="status" className="bg-warning/15 px-4 py-3 text-sm text-warning">{message}</div> : null;
}

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
  if (connection === 'live') return <RecoveryBanner />;
  const tone = connection === 'offline' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning';
  return (
    <><RecoveryBanner /><div className={`flex items-center justify-center gap-2 px-4 py-1.5 text-label font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {MESSAGE[connection]}
    </div></>
  );
}
