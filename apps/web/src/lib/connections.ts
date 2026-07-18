/** Client for the connections API. Always sends the token; never receives secrets. */
import { ConnectionStatus } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export async function fetchConnections(): Promise<ConnectionStatus[]> {
  const res = await fetch(`${SERVER_URL}/api/connections`, { headers: headers() });
  if (!res.ok) throw new Error(`connections: ${res.status}`);
  return ConnectionStatus.array().parse(((await res.json()) as { connections: unknown }).connections);
}

export async function saveConnection(id: string, value: string): Promise<ConnectionStatus> {
  const res = await fetch(`${SERVER_URL}/api/connections/${id}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? `save failed (${res.status})`);
  return ConnectionStatus.parse(((await res.json()) as { status: unknown }).status);
}

export async function removeConnection(id: string): Promise<ConnectionStatus> {
  const res = await fetch(`${SERVER_URL}/api/connections/${id}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error(`remove failed (${res.status})`);
  return ConnectionStatus.parse(((await res.json()) as { status: unknown }).status);
}
