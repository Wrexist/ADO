/**
 * GitHubClient — the narrow interface the sync depends on. octokit is an unstable
 * external surface, so it lives behind this adapter; the sync logic and its tests use
 * this interface only (real adapter in client.ts, fake in tests).
 */

export interface GhRepo {
  owner: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers: number;
  defaultBranch: string;
  pushedAt: string | null; // ISO
}

export interface GhRun {
  workflowName: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | timed_out | null
}

export interface GhRelease {
  id: number;
  tag: string;
  publishedAt: string | null;
}

export interface GitHubClient {
  /** The authenticated user's repos (owner ∩ scanner defines the portfolio). */
  listRepos(): Promise<GhRepo[]>;
  openPrCount(owner: string, name: string): Promise<number>;
  latestRun(owner: string, name: string): Promise<GhRun | null>;
  listReleases(owner: string, name: string): Promise<GhRelease[]>;
}
