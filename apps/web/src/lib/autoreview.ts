/** Client for the Auto-Review API — settings, manual runs, and confirmed fix dispatch. */
import { AutoReviewSettings, type ReviewSeverity, type ReviewVerdict } from '@ado/shared';
import type { Tone } from '../kit';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

async function bodyError(res: Response, fallback: string): Promise<string> {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

export async function fetchAutoReviewSettings(): Promise<{ settings: AutoReviewSettings[]; hasKey: boolean }> {
  const res = await fetch(`${SERVER_URL}/api/autoreview`, { headers: headers() });
  if (!res.ok) throw new Error(`autoreview settings: ${res.status}`);
  const body = (await res.json()) as { settings: unknown; hasKey?: unknown };
  return { settings: AutoReviewSettings.array().parse(body.settings), hasKey: body.hasKey === true };
}

export async function setAutoReviewEnabled(repoId: string, enabled: boolean): Promise<AutoReviewSettings> {
  const res = await fetch(`${SERVER_URL}/api/autoreview/${encodeURIComponent(repoId)}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(await bodyError(res, `toggle failed (${res.status})`));
  return AutoReviewSettings.parse(((await res.json()) as { settings: unknown }).settings);
}

/** Start a review of the repo's latest change now. The result streams in over SSE. */
export async function runReviewNow(repoId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/autoreview/${encodeURIComponent(repoId)}/run`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await bodyError(res, `review failed to start (${res.status})`));
}

/** Dispatch a confirmed fix for one finding (or the whole review when findingIdx is omitted). */
export async function dispatchReviewFix(reviewId: string, findingIdx?: number): Promise<{ runId: string }> {
  const res = await fetch(`${SERVER_URL}/api/reviews/${encodeURIComponent(reviewId)}/fix`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ findingIdx }),
  });
  if (!res.ok) throw new Error(await bodyError(res, `fix dispatch failed (${res.status})`));
  return (await res.json()) as { runId: string };
}

/** Severity → design tone (tokens only, never raw color). */
export const SEVERITY_TONE: Record<ReviewSeverity, Tone> = {
  info: 'muted',
  minor: 'info',
  major: 'warning',
  critical: 'danger',
};

/** Verdict → design tone. */
export const VERDICT_TONE: Record<ReviewVerdict, Tone> = {
  clean: 'success',
  attention: 'warning',
  block: 'danger',
};
