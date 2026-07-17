/** Client for the run log + live run control — zod-parsed at the boundary (convention 2). */
import { AgentRun, RunDetail } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

async function bodyError(res: Response, fallback: string): Promise<string> {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

/** Persisted run history, newest first (survives restarts — it's the real run log). */
export async function fetchRuns(repoId?: string, limit = 30): Promise<AgentRun[]> {
  const q = new URLSearchParams();
  if (repoId) q.set('repo', repoId);
  q.set('limit', String(limit));
  const res = await fetch(`${SERVER_URL}/api/runs?${q}`, { headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `runs: ${res.status}`));
  return AgentRun.array().parse(((await res.json()) as { runs: unknown }).runs);
}

/** One run with its timeline (live/ended) or an honest 'unavailable' for pre-boot runs. */
export async function fetchRunDetail(id: string): Promise<RunDetail> {
  const res = await fetch(`${SERVER_URL}/api/runs/${encodeURIComponent(id)}`, { headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `run: ${res.status}`));
  return RunDetail.parse(((await res.json()) as { run: unknown }).run);
}

/** Kill a running run / cancel a queued one. Server refuses runs that aren't in flight. */
export async function killRun(id: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/runs/${encodeURIComponent(id)}/kill`, {
    method: 'POST',
    headers: headers(),
    body: '{}',
  });
  if (!res.ok) throw new Error(await bodyError(res, `kill failed (${res.status})`));
}
