/** Client for TestFlight deploy templates — CRUD, per-repo auto-fill, and deploy dispatch. */
import type { TestFlightAutofill, TestFlightProfile, TestFlightProfileInputT } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

async function bodyError(res: Response, fallback: string): Promise<string> {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

/** Templates for one repo, or ALL templates when repoId is omitted (the Deployments page). */
export async function fetchTestFlightProfiles(repoId?: string): Promise<TestFlightProfile[]> {
  const q = repoId ? `?repo=${encodeURIComponent(repoId)}` : '';
  const res = await fetch(`${SERVER_URL}/api/testflight/profiles${q}`, { headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `templates: ${res.status}`));
  return ((await res.json()) as { profiles: TestFlightProfile[] }).profiles;
}

export async function saveTestFlightProfile(input: TestFlightProfileInputT): Promise<TestFlightProfile> {
  const res = await fetch(`${SERVER_URL}/api/testflight/profiles`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await bodyError(res, `save failed (${res.status})`));
  return ((await res.json()) as { profile: TestFlightProfile }).profile;
}

export async function deleteTestFlightProfile(id: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/testflight/profiles/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `delete failed (${res.status})`));
}

/** Live auto-fill from the repo's real Xcode/fastlane files. Throws on 404 (not scanned). */
export async function fetchTestFlightAutofill(repoId: string): Promise<TestFlightAutofill> {
  const res = await fetch(`${SERVER_URL}/api/projects/${encodeURIComponent(repoId)}/testflight/autofill`, { headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `autofill: ${res.status}`));
  return ((await res.json()) as { autofill: TestFlightAutofill }).autofill;
}

/** Dispatch a deploy run with this deploy's version override. */
export async function deployTestFlight(
  id: string,
  version: { marketingVersion: string; buildNumber: string },
): Promise<{ runId: string; version: string }> {
  const res = await fetch(`${SERVER_URL}/api/testflight/profiles/${encodeURIComponent(id)}/deploy`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(version),
  });
  if (!res.ok) throw new Error(await bodyError(res, `deploy failed (${res.status})`));
  return (await res.json()) as { runId: string; version: string };
}
