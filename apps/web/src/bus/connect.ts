/**
 * SSE client. Fresh connect → snapshot frame replaces the store; reconnect → the
 * browser sends Last-Event-ID automatically and the server replays only the gap.
 * While disconnected the UI flags itself reconnecting/stale — pre-sleep values are
 * never silently presented as live (council S5).
 */
import { parseEvent, parseSnapshot, Sample } from '@ado/shared';
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

  // Every frame is validated at the boundary (convention 12: unstable interfaces via
  // validated adapters). A malformed frame is dropped and logged — never thrown out of
  // the listener (which would silently kill the handler and strand the UI on live).
  const onFrame = (label: string, handle: (data: string, id: string) => void) => (e: Event) => {
    const msg = e as MessageEvent<string>;
    try {
      handle(msg.data, msg.lastEventId);
    } catch (err) {
      console.error(`bus: dropped malformed ${label} frame`, err);
    }
  };

  es.addEventListener('snapshot', onFrame('snapshot', (data) => {
    applySnapshot(parseSnapshot(JSON.parse(data)));
    setConnection('live');
  }));

  es.addEventListener('evt', onFrame('evt', (data, id) => {
    applyEvent(Number(id), parseEvent(JSON.parse(data)));
  }));

  // Transient sysmon samples — folded into state, no seq checkpoint. Zod-validated like
  // the durable frames (was the one channel bypassing validation).
  es.addEventListener('sample', onFrame('sample', (data) => {
    applySample(Sample.parse(JSON.parse(data)));
  }));

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
