/**
 * Octokit adapter — the only file that touches @octokit/rest. Implements GitHubClient
 * with conditional requests: each endpoint's ETag is cached and sent as If-None-Match,
 * so an unchanged poll returns 304 and costs no rate limit (DATA_MAP / council S5).
 */
import { Octokit } from '@octokit/rest';
import type { GhRelease, GhRepo, GhRun, GitHubClient } from './types';

interface CacheEntry {
  etag: string | undefined;
  data: unknown;
}

export class OctokitClient implements GitHubClient {
  private octokit: Octokit;
  private cache = new Map<string, CacheEntry>();

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /** Run a call with the cached ETag; a 304 (resolved or thrown) returns cached data. */
  private async cond<T>(
    key: string,
    call: (etag: string | undefined) => Promise<{ status: number; headers: { etag?: string }; data: T }>,
  ): Promise<T> {
    const prev = this.cache.get(key);
    try {
      const res = await call(prev?.etag);
      if (res.status === 304 && prev) return prev.data as T;
      this.cache.set(key, { etag: res.headers.etag, data: res.data });
      return res.data;
    } catch (e) {
      const err = e as { status?: number };
      if (err.status === 304 && prev) return prev.data as T;
      throw e;
    }
  }

  async listRepos(): Promise<GhRepo[]> {
    const data = await this.cond('repos', (etag) =>
      this.octokit.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: 'pushed',
        affiliation: 'owner',
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    return data.map((r) => ({
      owner: r.owner.login,
      name: r.name,
      description: r.description,
      language: r.language ?? null,
      stargazers: r.stargazers_count ?? 0,
      defaultBranch: r.default_branch ?? 'main',
      pushedAt: r.pushed_at ?? null,
    }));
  }

  async openPrCount(owner: string, name: string): Promise<number> {
    const data = await this.cond(`prs:${owner}/${name}`, (etag) =>
      this.octokit.pulls.list({
        owner,
        repo: name,
        state: 'open',
        per_page: 100,
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    return data.length;
  }

  async latestRun(owner: string, name: string): Promise<GhRun | null> {
    const data = await this.cond(`run:${owner}/${name}`, (etag) =>
      this.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: name,
        per_page: 1,
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    const run = data.workflow_runs?.[0];
    if (!run) return null;
    return {
      workflowName: run.name ?? 'CI',
      status: run.status ?? 'completed',
      conclusion: run.conclusion ?? null,
    };
  }

  async listReleases(owner: string, name: string): Promise<GhRelease[]> {
    const data = await this.cond(`rel:${owner}/${name}`, (etag) =>
      this.octokit.repos.listReleases({
        owner,
        repo: name,
        per_page: 3,
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    return data.map((r) => ({ id: r.id, tag: r.tag_name, publishedAt: r.published_at }));
  }
}
