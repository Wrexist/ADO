/** Client for the command center. Token-gated; mutations require a confirm round-trip. */
import type { CommandResponse, Intent } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export async function runCommand(text: string): Promise<CommandResponse> {
  const res = await fetch(`${SERVER_URL}/api/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `command failed (${res.status})`);
  return (await res.json()) as CommandResponse;
}

export async function confirmIntent(intent: Intent): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${SERVER_URL}/api/command/execute`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(intent),
  });
  if (!res.ok) throw new Error(`execute failed (${res.status})`);
  return (await res.json()) as { ok: boolean; message: string };
}
