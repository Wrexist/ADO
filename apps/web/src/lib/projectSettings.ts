/** Client for per-project settings, git link info (PR buttons), and clone-from-GitHub. */
import type { ProjectFeatureId, ProjectFeatureMap, ProjectGitInfo } from '@ado/shared';
import { ACC_TOKEN, SERVER_URL } from './config';

const headers = () => ({ 'content-type': 'application/json', 'x-acc-token': ACC_TOKEN });

async function bodyError(res: Response, fallback: string): Promise<string> {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

export async function fetchProjectSettings(repoId: string): Promise<ProjectFeatureMap> {
  const res = await fetch(`${SERVER_URL}/api/projects/${encodeURIComponent(repoId)}/settings`, { headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `settings: ${res.status}`));
  return ((await res.json()) as { features: ProjectFeatureMap }).features;
}

export async function setProjectFeature(repoId: string, feature: ProjectFeatureId, enabled: boolean): Promise<ProjectFeatureMap> {
  const res = await fetch(`${SERVER_URL}/api/projects/${encodeURIComponent(repoId)}/settings`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ feature, enabled }),
  });
  if (!res.ok) throw new Error(await bodyError(res, `save failed (${res.status})`));
  return ((await res.json()) as { features: ProjectFeatureMap }).features;
}

/** Git link facts for the GitHub buttons. Throws on 404 (repo not scanned locally). */
export async function fetchProjectGit(repoId: string): Promise<ProjectGitInfo> {
  const res = await fetch(`${SERVER_URL}/api/projects/${encodeURIComponent(repoId)}/git`, { headers: headers() });
  if (!res.ok) throw new Error(await bodyError(res, `git info: ${res.status}`));
  return (await res.json()) as ProjectGitInfo;
}

/** Clone owner/repo (or a github.com URL) into a tracked projects folder and rescan.
 *  `dir` (optional) picks WHICH tracked folder — the server rejects untracked paths. */
export async function cloneFromGithub(repo: string, dir?: string): Promise<{ dir: string; repos: number }> {
  const res = await fetch(`${SERVER_URL}/api/projects/github`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ repo, dir }),
  });
  if (!res.ok) throw new Error(await bodyError(res, `clone failed (${res.status})`));
  return (await res.json()) as { dir: string; repos: number };
}
