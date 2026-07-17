/** Client for the deep-review API (claude ultrareview). Token-gated; streams via polling. */
import { ReviewRun } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export async function startReview(repoId: string): Promise<ReviewRun> {
  const res = await fetch(`${SERVER_URL}/api/projects/${encodeURIComponent(repoId)}/review`, { method: 'POST', headers: headers(), body: '{}' });
  const body = (await res.json()) as { run?: unknown; error?: string };
  if (!res.ok) throw new Error(body.error ?? `review failed (${res.status})`);
  return ReviewRun.parse(body.run); // validated at the boundary (convention 2)
}

export async function pollReview(runId: string): Promise<ReviewRun> {
  const res = await fetch(`${SERVER_URL}/api/review/${runId}`, { headers: headers() });
  if (!res.ok) throw new Error(`poll: ${res.status}`);
  return ReviewRun.parse(((await res.json()) as { run: unknown }).run);
}
