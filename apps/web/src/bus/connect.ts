/**
 * SSE client. Fresh connect → snapshot frame replaces the store; reconnect → the
 * browser sends Last-Event-ID automatically and the server replays only the gap.
 * While disconnected the UI flags itself reconnecting/stale — pre-sleep values are
 * never silently presented as live (council S5).
 */
import { parseEvent, parseSnapshot } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from '../lib/config';
import { useBus } from '../store/bus';

let started = false;

export function startBus(): void {
  if (started) return;
  started = true;

  const { applySnapshot, applyEvent, applySample, setConnection } = useBus.getState();

  if (!ACC_TOKEN) {
    // No token configured (no .env yet) — honest offline, no fake data.
    setConnection('offline');
    return;
  }

  const es = new EventSource(`${SERVER_URL}/events?token=${encodeURIComponent(ACC_TOKEN)}`);

  es.onopen = () => setConnection('live');
  es.onerror = () => setConnection('reconnecting'); // EventSource retries itself

  es.addEventListener('snapshot', (e) => {
    const msg = e as MessageEvent<string>;
    applySnapshot(parseSnapshot(JSON.parse(msg.data)));
    setConnection('live');
  });

  es.addEventListener('evt', (e) => {
    const msg = e as MessageEvent<string>;
    applyEvent(Number(msg.lastEventId), parseEvent(JSON.parse(msg.data)));
  });

  // Transient sysmon samples — folded into state, no seq checkpoint.
  es.addEventListener('sample', (e) => {
    const msg = e as MessageEvent<string>;
    applySample(JSON.parse(msg.data) as Parameters<typeof applySample>[0]);
  });

  // App-open logging — feeds the p2.5 daily-driver gate. Fire-and-forget.
  const sessionId = crypto.randomUUID();
  void fetch(`${SERVER_URL}/api/app-open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {
    /* server down — the connection state already says so */
  });
}
