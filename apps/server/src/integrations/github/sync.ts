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
import { categoryFromLanguage, ciFromRun, slug, toLanguage } from './map';
import type { GitHubClient } from './types';

const BASE_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 10 * 60_000;

export class GitHubSync {
  private timer: NodeJS.Timeout | null = null;
  private interval = BASE_INTERVAL_MS;
  private stopped = false;

  constructor(
    private bus: Bus,
    private client: GitHubClient,
    private log: (msg: string) => void = () => {},
  ) {}

  /** One full sync pass. Returns the number of repos enriched. */
  async sync(): Promise<number> {
    const now = () => new Date().toISOString();
    const repos = await this.client.listRepos();
    let enriched = 0;

    for (const gh of repos) {
      const id = slug(gh.name);
      const exists = this.bus.snapshot().state.repos[id] !== undefined;

      // Create a base repo only when the scanner didn't (avoids clobbering its fields).
      if (!exists) {
        this.bus.publish({
          id: `gh-base:${id}`,
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
              branch: gh.defaultBranch,
              updatedTs: gh.pushedAt ?? now(),
            },
          },
        });
      }

      // Enrich: stars, language, PR count, latest CI. Each sub-call is best-effort.
      const [prs, run] = await Promise.all([
        this.client.openPrCount(gh.owner, gh.name).catch(() => undefined),
        this.client.latestRun(gh.owner, gh.name).catch(() => null),
      ]);

      const patch: Record<string, unknown> = {
        stars: gh.stargazers,
        language: toLanguage(gh.language),
      };
      if (typeof prs === 'number') patch.prs = prs;
      if (run) patch.ci = ciFromRun(run);

      // Emit ONLY when the patch actually changes something. Keying the id on pushedAt
      // was wrong twice over: PR/CI change without a push (repeat id → dedup drops the
      // update → stale UI), and a never-pushed repo fell back to now() (fresh id every
      // 60s → unbounded log growth). Compare against current state; fresh id on change.
      const current = this.bus.snapshot().state.repos[id];
      const changed =
        !current ||
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
      const releases = await this.client.listReleases(gh.owner, gh.name).catch(() => []);
      for (const rel of releases) {
        this.bus.publish({
          id: `gh-release:${id}:${rel.id}`,
          type: 'deploy.recorded',
          ts: rel.publishedAt ?? now(),
          source: { kind: 'github', ref: `${gh.owner}/${gh.name}#${rel.id}` },
          payload: {
            deployment: {
              id: `${id}-${rel.id}`,
              name: gh.name,
              env: 'production',
              ts: rel.publishedAt ?? now(),
              ok: true,
              repoId: id,
            },
          },
        });
      }
    }

    this.emitHealth('operational');
    return enriched;
  }

  private emitHealth(state: 'operational' | 'degraded' | 'down'): void {
    this.bus.publish({
      id: `health:github:${Date.now()}`,
      type: 'health.checked',
      ts: new Date().toISOString(),
      source: { kind: 'health', ref: 'github' },
      payload: { service: 'github', state },
    });
  }

  /** Poll with backoff: reset to 60s on success, double to 10m on failure. */
  start(): void {
    const tick = async () => {
      if (this.stopped) return;
      try {
        const n = await this.sync();
        this.interval = BASE_INTERVAL_MS;
        this.log(`github: enriched ${n} repo(s)`);
      } catch (err) {
        this.interval = Math.min(this.interval * 2, MAX_INTERVAL_MS);
        this.emitHealth('degraded');
        this.log(`github: sync failed (${(err as Error).message}); backing off to ${this.interval / 1000}s`);
      }
      if (!this.stopped) this.timer = setTimeout(tick, this.interval);
    };
    void tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
