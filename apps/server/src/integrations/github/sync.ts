/**
 * GitHub sync (Prompt 2.3): enriches scanner repos with GitHub data and records
 * releases as deployments. Semantics = intersection (DATA_MAP): GitHub repos are
 * matched to already-known repos by slug and ENRICHED (never clobbering the scanner's
 * base fields). A GitHub repo with no local match creates a GitHub-sourced base repo
 * so a token-only setup still shows a portfolio.
 *
 * Polls with backoff; a failed poll flips the `github` health check to degraded/down
 * (honest state) instead of throwing.
 */
import type { Bus } from '../../bus';
import { categoryFromLanguage, ciFromRun, toLanguage } from './map';
import type { GitHubClient, GhRepo } from './types';
import { randomUUID } from 'node:crypto';

const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 10 * 60_000;
const MAX_RATE_LIMIT_WAIT_MS = 60 * 60_000;

/** GitHub asked us to stop: the pass ends at once and the next one waits for `waitMs`. */
export class GitHubRateLimited extends Error {
  constructor(readonly waitMs: number) { super(`rate limited for ${Math.round(waitMs / 1000)}s`); }
}

/** Recognise primary/secondary rate limits from an Octokit error; null for other failures. */
export function rateLimitWait(err: unknown, nowMs = Date.now()): number | null {
  const e = err as { status?: number; response?: { headers?: Record<string, string | number | undefined> } };
  const headers = e?.response?.headers ?? {};
  const header = (name: string) => { const v = headers[name]; return v === undefined ? null : Number(v); };
  const retryAfter = header('retry-after'), remaining = header('x-ratelimit-remaining'), reset = header('x-ratelimit-reset');
  const limited = e?.status === 429 || (e?.status === 403 && (remaining === 0 || retryAfter !== null));
  if (!limited) return null;
  const wait = retryAfter !== null && Number.isFinite(retryAfter) ? retryAfter * 1000
    : reset !== null && Number.isFinite(reset) ? reset * 1000 - nowMs : BASE_INTERVAL_MS;
  return Math.min(Math.max(wait, BASE_INTERVAL_MS), MAX_RATE_LIMIT_WAIT_MS);
}

export class GitHubSync {
  private timer: NodeJS.Timeout | null = null;
  private interval = BASE_INTERVAL_MS;
  private stopped = false;
  private started = false;
  private pending: Promise<number> | null = null;
  private partial = false;

  constructor(
    private bus: Bus,
    private client: GitHubClient,
    private log: (msg: string) => void = () => {},
    private observe?: (repos: GhRepo[], observedTs: string) => void,
    private observeHead?: (externalId: string, branch: string, sha: string | null, checkedTs: string) => void,
  ) {}

  /** One full sync pass. Returns the number of repos enriched. */
  sync(): Promise<number> {
    if (this.stopped) return Promise.resolve(0);
    if (this.pending) return this.pending;
    const job = this.syncPass();
    this.pending = job;
    void job.finally(() => { if (this.pending === job) this.pending = null; }).catch(() => {});
    return job;
  }

  /** Delay before the next scheduled pass (exposed for tests and diagnostics). */
  get nextDelayMs(): number { return this.interval; }

  private async syncPass(): Promise<number> {
    const now = () => new Date().toISOString();
    this.partial = false;
    const repos = await this.client.listRepos().catch((e: unknown) => { throw this.limited(e) ?? e; });
    if (this.stopped) return 0;
    this.observe?.(repos, now());
    let enriched = 0;
    let degraded = false;

    for (const gh of repos) {
      if (this.stopped) return enriched;
      const fullName = `${gh.owner}/${gh.name}`.toLowerCase();
      const repoId = gh.externalId && /^\d+$/.test(gh.externalId) ? gh.externalId : undefined;
      // T01: identity is GitHub's numeric id, never the name. A name reused by a different
      // repository must not inherit the old entry; a rename keeps its entry.
      const known = Object.values(this.bus.snapshot().state.repos);
      const byRepoId = repoId ? known.find((r) => r.githubRepoId === repoId) : undefined;
      const matched = byRepoId?.localPath ? byRepoId
        : known.find((r) => r.localPath && r.githubFullName === fullName && (!r.githubRepoId || !repoId || r.githubRepoId === repoId));
      const legacyId = `github-${Buffer.from(fullName).toString('base64url')}`;
      const legacy = this.bus.snapshot().state.repos[legacyId];
      const id = matched?.id ?? byRepoId?.id
        ?? (!repoId ? legacyId : legacy && !legacy.localPath && !legacy.githubRepoId ? legacyId : `github-${repoId}`);
      const exists = Boolean(matched);

      // Create a base repo only when the scanner didn't (avoids clobbering its fields).
      if (!exists) {
        this.bus.publish({
          id: `gh-base:${id}:${fullName}:${gh.pushedAt}:${gh.description}:${gh.defaultBranch}`,
          type: 'repo.upserted',
          ts: now(),
          source: { kind: 'github', ref: `${gh.owner}/${gh.name}` },
          payload: {
            repo: {
              id,
              name: gh.name,
              category: categoryFromLanguage(gh.language),
              status: 'active',
              description: gh.description ?? '',
              branch: gh.defaultBranch || 'unknown',
              updatedTs: gh.pushedAt ?? now(),
              githubFullName: fullName,
              ...(repoId ? { githubRepoId: repoId } : {}),
            },
          },
        });
      }

      // Enrich: stars, language, PR count, latest CI. Each sub-call is best-effort.
      const [prs, run, branchHead] = await Promise.all([
        this.client.openPrCount(gh.owner, gh.name).catch((e: unknown) => { this.softFail(e); degraded = true; return undefined; }),
        this.client.latestRun(gh.owner, gh.name, gh.defaultBranch || undefined).catch((e: unknown) => { this.softFail(e); degraded = true; return null; }),
        gh.defaultBranch
          ? this.client.branchHead(gh.owner, gh.name, gh.defaultBranch).catch((e: unknown) => { this.softFail(e); degraded = true; return null; })
          : Promise.resolve(null),
      ]);
      if (this.stopped) return enriched;
      if (repoId && gh.defaultBranch) this.observeHead?.(repoId, gh.defaultBranch, branchHead, now());

      const patch: Record<string, unknown> = {
        ...(repoId ? { githubRepoId: repoId } : {}),
        stars: gh.stargazers,
        language: toLanguage(gh.language),
      };
      if (typeof prs === 'number') patch.prs = prs;
      if (run) patch.ci = ciFromRun(run, branchHead);
      if (run?.id && run.headSha && run.branch) {
        const state = ciFromRun(run).state;
        // Only actual completed successes/failures trigger automation. Unknown or
        // cancelled outcomes are recorded as activity, never queued forever.
        if (run.status !== 'completed' || ['success', 'failure', 'timed_out'].includes(run.conclusion ?? '')) {
          this.bus.publish({
            id: `gh-run:${fullName}:${run.id}:${run.status}:${run.conclusion}`,
            type: 'build.updated', ts: now(), source: { kind: 'github', ref: fullName },
            payload: { build: { id: `gh-run:${fullName}:${run.id}`, repo: id,
              jobLabel: run.workflowName, branch: run.branch, headSha: run.headSha,
              workflowRunId: run.id, kind: 'ci', state,
              startedTs: run.startedAt ?? null, elapsedSec: null } },
          });
        }
      }

      // Emit ONLY when the patch actually changes something. Keying the id on pushedAt
      // was wrong twice over: PR/CI change without a push (repeat id → dedup drops the
      // update → stale UI), and a never-pushed repo fell back to now() (fresh id every
      // 60s → unbounded log growth). Compare against current state; fresh id on change.
      const current = this.bus.snapshot().state.repos[id];
      const changed =
        !current ||
        ('githubRepoId' in patch && current.githubRepoId !== patch.githubRepoId) ||
        ('stars' in patch && current.stars !== patch.stars) ||
        ('language' in patch && current.language !== patch.language) ||
        ('prs' in patch && current.prs !== patch.prs) ||
        ('ci' in patch && JSON.stringify(current.ci) !== JSON.stringify(patch.ci));

      if (changed) {
        const ts = now();
        this.bus.publish({
          id: `gh-enrich:${id}:${ts}`,
          type: 'repo.enriched',
          ts,
          source: { kind: 'github', ref: `${gh.owner}/${gh.name}` },
          payload: { repoId: id, patch },
        });
        enriched++;
      }

      // Releases → deployments (idempotent by release id).
      const releases = await this.client.listReleases(gh.owner, gh.name).catch((e: unknown) => { this.softFail(e); degraded = true; return []; });
      if (this.stopped) return enriched;
      for (const rel of releases) {
        this.bus.publish({
          id: `gh-release:${id}:${rel.id}`,
          type: 'activity.appended',
          ts: rel.publishedAt ?? now(),
          source: { kind: 'github', ref: `${gh.owner}/${gh.name}#${rel.id}` },
          payload: {
            item: {
              id: `${id}-${rel.id}`,
              title: gh.name,
              detail: `Release ${rel.tag} published on GitHub (deployment not verified)`,
              icon: 'github', tone: 'info',
              ts: rel.publishedAt ?? now(),
              repoId: id,
            },
          },
        });
      }
    }

    this.partial = degraded;
    this.emitHealth(degraded ? 'degraded' : 'operational');
    return enriched;
  }

  private limited(err: unknown): GitHubRateLimited | null {
    const wait = rateLimitWait(err);
    return wait === null ? null : new GitHubRateLimited(wait);
  }

  /** Swallow an ordinary per-repo failure; rethrow a rate limit so the pass stops. */
  private softFail(err: unknown): void {
    const limited = this.limited(err);
    if (limited) throw limited;
  }

  private emitHealth(state: 'operational' | 'degraded' | 'down'): void {
    if (this.stopped) return;
    this.bus.publish({
      id: `health:github:${randomUUID()}`,
      type: 'health.checked',
      ts: new Date().toISOString(),
      source: { kind: 'health', ref: 'github' },
      payload: { service: 'github', state },
    });
  }

  /**
   * Poll with backoff: 60s after a clean pass; doubling to 10m after a failed or partial
   * pass; after a rate limit, wait until GitHub's reset (1–60m). Never retries in parallel.
   */
  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    const tick = async () => {
      if (this.stopped) return;
      try {
        const n = await this.sync();
        if (this.stopped) return;
        this.interval = this.partial ? Math.min(this.interval * 2, MAX_INTERVAL_MS) : BASE_INTERVAL_MS;
        this.log(`github: enriched ${n} repo(s)${this.partial ? `; some calls failed, next pass in ${this.interval / 1000}s` : ''}`);
      } catch (err) {
        if (this.stopped) return;
        this.interval = err instanceof GitHubRateLimited ? err.waitMs : Math.min(this.interval * 2, MAX_INTERVAL_MS);
        this.emitHealth('degraded');
        this.log(`github: sync failed (${(err as Error).message}); next pass in ${this.interval / 1000}s`);
      }
      if (!this.stopped) this.timer = setTimeout(tick, this.interval);
    };
    void tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
