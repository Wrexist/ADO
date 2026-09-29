/**
 * Octokit adapter — the only file that touches @octokit/rest. Implements GitHubClient
 * with conditional requests: each endpoint's ETag is cached and sent as If-None-Match,
 * so an unchanged poll returns 304 and costs no rate limit (DATA_MAP / council S5).
 */
import { Octokit } from '@octokit/rest';
import type { GhPr, GhRelease, GhRepo, GhRun, GitHubClient } from './types';

interface CacheEntry {
  etag: string | undefined;
  data: unknown;
}

export class OctokitClient implements GitHubClient {
  private octokit: Octokit;
  private cache = new Map<string, CacheEntry>();

  constructor(token: string, fetchImpl: typeof fetch = fetch) {
    this.octokit = new Octokit({ auth: token, request: { fetch: fetchImpl } });
    // T18 scope: the dashboard only reads GitHub. A write has an uncertain outcome on
    // timeout and would need a journal with a stable identity, a lookup before any retry
    // and an unknown_outcome state. Until that exists, writes are refused here.
    this.octokit.hook.before('request', (options) => {
      if (options.method !== 'GET' && options.method !== 'HEAD') throw new Error(`GitHub ${options.method} refused: the dashboard is read-only on GitHub`);
    });
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
      externalId: String(r.id),
      owner: r.owner.login,
      name: r.name,
      description: r.description,
      language: r.language ?? null,
      stargazers: r.stargazers_count ?? 0,
      defaultBranch: r.default_branch ?? '',
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

  async openPrForBranch(owner: string, name: string, branch: string): Promise<GhPr | null> {
    const data = await this.cond(`prbr:${owner}/${name}:${branch}`, (etag) =>
      this.octokit.pulls.list({
        owner,
        repo: name,
        state: 'open',
        head: `${owner}:${branch}`,
        per_page: 1,
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    const pr = data[0];
    if (!pr) return null;

    // Enrich with live status. Both are best-effort: a token without the scope, or GitHub
    // still computing mergeability, degrades to null — an honest unknown, never a guess.
    // (Deliberately NOT ETag-cached: mergeable/checks must reflect now, not a cached poll.)
    let mergeable: boolean | null = null;
    let target: { head: string; base: string } | null = null;
    try {
      const full = await this.octokit.pulls.get({ owner, repo: name, pull_number: pr.number });
      if (full.data.number === pr.number && full.data.state === 'open'
        && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(full.data.head?.sha ?? '')
        && full.data.head.sha === pr.head?.sha
        && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(full.data.base?.sha ?? '')) {
        target = { head: full.data.head.sha, base: full.data.base.sha };
      }
    } catch {
      /* not visible → unknown */
    }
    let checks: GhPr['checks'] = null;
    try {
      if (!target) throw new Error('Current PR revision could not be established');
      const runs = await this.octokit.checks.listForRef({ owner, repo: name, ref: pr.head.sha, per_page: 50 });
      const all = runs.data.check_runs ?? [];
      if (all.length > 0 && all.every(r => r.head_sha === pr.head.sha && Number.isSafeInteger(r.id) && r.id > 0) && new Set(all.map(r => r.id)).size === all.length) {
        // A partial page is not proof that every check passed. Unknown terminal
        // conclusions must not fall through to green either. This summarizes
        // observed checks, not branch protection or merge permission.
        if (all.some((r) => r.status === 'completed' && ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(r.conclusion ?? ''))) checks = 'failing';
        else if (all.some((r) => ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(r.status))) checks = 'pending';
        else if (runs.data.total_count === all.length && all.every((r) => r.status === 'completed' && r.conclusion === 'success')) checks = 'passing';
      }
    } catch {
      /* no checks scope / none configured → unknown */
    }
    if (target) {
      try {
        // Re-read after checks: head/base changes or closure invalidate the combined
        // observation. Do not mix mergeability from one revision with checks of another.
        const current = await this.octokit.pulls.get({ owner, repo: name, pull_number: pr.number });
        if (current.data.number !== pr.number || current.data.state !== 'open'
          || current.data.head?.sha !== target.head || current.data.base?.sha !== target.base) checks = null;
        else mergeable = typeof current.data.mergeable === 'boolean' ? current.data.mergeable : null;
      } catch { checks = null; }
    }
    return {
      number: pr.number,
      title: pr.title ?? '',
      url: pr.html_url ?? `https://github.com/${owner}/${name}/pull/${pr.number}`,
      mergeable,
      checks,
    };
  }

  async latestRun(owner: string, name: string, branch?: string): Promise<GhRun | null> {
    const data = await this.cond(`run:${owner}/${name}:${branch ?? ''}`, (etag) =>
      this.octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo: name,
        per_page: 1,
        branch,
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    const run = data.workflow_runs?.[0];
    if (!run) return null;
    return {
      id: run.id,
      headSha: run.head_sha,
      branch: run.head_branch ?? undefined,
      startedAt: run.run_started_at ?? run.created_at,
      workflowName: run.name ?? 'CI',
      status: run.status ?? 'completed',
      conclusion: run.conclusion ?? null,
    };
  }

  async branchHead(owner: string, name: string, branch: string): Promise<string | null> {
    const data = await this.cond(`head:${owner}/${name}:${branch}`, (etag) =>
      this.octokit.repos.getBranch({
        owner,
        repo: name,
        branch,
        headers: etag ? { 'if-none-match': etag } : {},
      }),
    );
    const sha = data.name === branch ? data.commit?.sha : undefined;
    return typeof sha === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sha) ? sha : null;
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
