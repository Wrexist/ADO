/** Header-authenticated SSE with reconnect cursor; credentials never enter a URL. */
import { parseEvent, parseSnapshot, Sample } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from '../lib/config';
import { useBus } from '../store/bus';

let connection: AbortController | null = null;
export function stopBus(): void {
  connection?.abort(); connection = null;
  useBus.getState().setConnection('offline');
}
export function startBus(): void {
  if (connection || !ACC_TOKEN) return;
  const controller = new AbortController(); connection = controller;
  const token = ACC_TOKEN;
  const { applySnapshot, applyEvent, applySample, setConnection } = useBus.getState();
  void (async () => {
    let cursor = '';
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(`${SERVER_URL}/events`, {
          headers: { 'x-acc-token': token, ...(cursor ? { 'last-event-id': cursor } : {}) }, signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error('Event connection unavailable');
        setConnection('live');
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let pending = '';
        try {
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read(); if (done) break;
            pending += value;
            if (pending.length > 16 * 1024 * 1024) throw new Error('Event frame too large');
            let boundary: number;
            while ((boundary = pending.indexOf('\n\n')) >= 0) {
              const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
              let event = ''; let id = ''; const data: string[] = [];
              for (const line of frame.split('\n')) {
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('id:')) id = line.slice(3).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
              }
              if (!data.length) continue;
              const parsed: unknown = JSON.parse(data.join('\n'));
              if (event === 'snapshot') applySnapshot(parseSnapshot(parsed));
              else if (event === 'evt') applyEvent(Number(id), parseEvent(parsed));
              else if (event === 'sample') applySample(Sample.parse(parsed));
              if (id) cursor = id;
            }
          }
        } finally { await reader.cancel().catch(() => {}); }
      } catch { /* abort and transient errors share the reconnect path */ }
      if (controller.signal.aborted) return;
      setConnection('reconnecting');
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, 2000); controller.signal.addEventListener('abort', done, { once: true });
      });
    }
  })();
  void fetch(`${SERVER_URL}/api/app-open`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': token },
    body: JSON.stringify({ sessionId: crypto.randomUUID() }), signal: controller.signal,
  }).catch(() => {});
}
