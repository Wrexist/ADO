/** Client for the projects API — add a folder to scan for git repos. Always sends the token. */
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

/** Add a folder; the server persists it and rescans live. Returns the tracked dirs + repo count. */
export async function addProject(dir: string): Promise<{ dirs: string[]; repos: number }> {
  const res = await fetch(`${SERVER_URL}/api/projects`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ dir }),
  });
  const body = (await res.json().catch(() => ({}))) as { dirs?: string[]; repos?: number; error?: string };
  if (!res.ok) throw new Error(body.error ?? `add failed (${res.status})`);
  return { dirs: body.dirs ?? [], repos: body.repos ?? 0 };
}

export async function listProjects(): Promise<{ dirs: string[]; envDirs: string[] }> {
  const res = await fetch(`${SERVER_URL}/api/projects`, { headers: headers() });
  if (!res.ok) throw new Error(`projects: ${res.status}`);
  const body = (await res.json()) as { dirs?: string[]; envDirs?: string[] };
  return { dirs: body.dirs ?? [], envDirs: body.envDirs ?? [] };
}

export async function removeProject(dir: string): Promise<string[]> {
  const res = await fetch(`${SERVER_URL}/api/projects`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ dir }),
  });
  if (!res.ok) throw new Error(`remove failed (${res.status})`);
  return ((await res.json()) as { dirs?: string[] }).dirs ?? [];
}
