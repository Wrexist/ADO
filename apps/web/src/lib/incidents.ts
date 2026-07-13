/** Client for the self-diagnosis API — report a failure, or dispatch a confirmed fix. */
import type { DiagnosisSeverity } from '@ado/shared';
import type { Tone } from '../kit';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

export interface ReportInput {
  kind: string;
  message: string;
  stack?: string;
  context?: string;
}

/**
 * Report a client-side failure (the root ErrorBoundary calls this). Best-effort and never
 * throws — reporting a crash must not cause another one. Returns the incident id when the
 * server accepted it (null when throttled, offline, or unauthorized).
 */
export async function reportIncident(input: ReportInput): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/incidents`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { incident?: { id: string } | null };
    return body.incident?.id ?? null;
  } catch {
    return null; // offline / server down — the fallback UI still renders
  }
}

/** Dispatch a confirmed fix for a diagnosed incident into a chosen (allow-listed) repo. */
export async function dispatchFix(incidentId: string, repoId: string, model?: string): Promise<{ runId: string }> {
  const res = await fetch(`${SERVER_URL}/api/incidents/${incidentId}/fix`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ repoId, model }),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `fix dispatch failed (${res.status})`);
  return (await res.json()) as { runId: string };
}

/** Severity → design tone (escalation muted → warning → danger). Tokens only, never raw color. */
export const SEVERITY_TONE: Record<DiagnosisSeverity, Tone> = {
  low: 'muted',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};
