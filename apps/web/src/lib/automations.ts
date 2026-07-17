/** Client for the automations API. Always sends the token. */
import { Automation, type AutomationInputT } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export async function fetchAutomations(): Promise<Automation[]> {
  const res = await fetch(`${SERVER_URL}/api/automations`, { headers: headers() });
  if (!res.ok) throw new Error(`automations: ${res.status}`);
  return Automation.array().parse(((await res.json()) as { automations: unknown }).automations);
}

export async function saveAutomation(input: AutomationInputT): Promise<Automation> {
  const res = await fetch(`${SERVER_URL}/api/automations`, { method: 'POST', headers: headers(), body: JSON.stringify(input) });
  const body = (await res.json()) as { automation?: unknown; error?: string };
  if (!res.ok) throw new Error(body.error ?? `save failed (${res.status})`);
  return Automation.parse(body.automation);
}

export async function deleteAutomation(id: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/automations/${id}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
}

export async function runAutomation(id: string): Promise<{ runId: string }> {
  const res = await fetch(`${SERVER_URL}/api/automations/${id}/run`, { method: 'POST', headers: headers(), body: '{}' });
  const body = (await res.json()) as { runId?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? `run failed (${res.status})`);
  return { runId: body.runId as string };
}
