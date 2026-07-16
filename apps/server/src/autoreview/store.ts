/**
 * Auto-Review settings store — per-repo opt-in + the reviewed-commit baseline, persisted to a
 * gitignored JSON file under data/ (same local-first trust model as automations/connections).
 * No secrets live here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RepoReviewSettings {
  enabled: boolean;
  /** Baseline: only commits AFTER this sha are auto-reviewed (seeded on enable — enabling
   *  must not surprise-review an old commit). */
  lastSha: string | null;
  /** Last auto-triggered review time — backs the per-repo min-interval throttle. */
  lastAutoTs: string | null;
}

const DEFAULTS: RepoReviewSettings = { enabled: false, lastSha: null, lastAutoTs: null };

export class AutoReviewStore {
  private data: Record<string, RepoReviewSettings> = {};

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, RepoReviewSettings>;
    } catch {
      this.data = {}; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  settings(repoId: string): RepoReviewSettings {
    return this.data[repoId] ?? { ...DEFAULTS };
  }

  /** Repo ids with auto-review enabled. */
  enabledRepoIds(): string[] {
    return Object.entries(this.data)
      .filter(([, s]) => s.enabled)
      .map(([id]) => id);
  }

  setEnabled(repoId: string, enabled: boolean, baselineSha: string | null): RepoReviewSettings {
    const prev = this.settings(repoId);
    // Enabling (re)seeds the baseline to the CURRENT head so only future commits auto-review.
    const next: RepoReviewSettings = enabled
      ? { ...prev, enabled: true, lastSha: baselineSha }
      : { ...prev, enabled: false };
    this.data[repoId] = next;
    this.persist();
    return next;
  }

  markReviewed(repoId: string, sha: string, atTs: string): void {
    const prev = this.settings(repoId);
    this.data[repoId] = { ...prev, lastSha: sha, lastAutoTs: atTs };
    this.persist();
  }
}
