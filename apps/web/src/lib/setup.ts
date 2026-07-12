/** Client for the setup API. Sends the token; the install command is chosen server-side by id. */
import type { InstallRun, ProbeResult } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export async function fetchSetup(): Promise<ProbeResult[]> {
  const res = await fetch(`${SERVER_URL}/api/setup`, { headers: headers() });
  if (!res.ok) throw new Error(`setup: ${res.status}`);
  return ((await res.json()) as { results: ProbeResult[] }).results;
}

export async function probeSetup(): Promise<ProbeResult[]> {
  // Empty body, but content-type is application/json — Fastify rejects an empty JSON body
  // with 400, so send an explicit {}.
  const res = await fetch(`${SERVER_URL}/api/setup/probe`, { method: 'POST', headers: headers(), body: '{}' });
  if (!res.ok) throw new Error(`probe: ${res.status}`);
  return ((await res.json()) as { results: ProbeResult[] }).results;
}

export async function startInstall(id: string): Promise<InstallRun> {
  const res = await fetch(`${SERVER_URL}/api/setup/install`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ id }),
  });
  const body = (await res.json()) as { run?: InstallRun; error?: string };
  if (!res.ok) throw new Error(body.error ?? `install failed (${res.status})`);
  return body.run as InstallRun;
}

export async function pollInstall(runId: string): Promise<InstallRun> {
  const res = await fetch(`${SERVER_URL}/api/setup/install/${runId}`, { headers: headers() });
  if (!res.ok) throw new Error(`poll: ${res.status}`);
  return ((await res.json()) as { run: InstallRun }).run;
}
