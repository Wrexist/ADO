/**
 * Per-project feature switches — persisted to a gitignored JSON file under data/ (same
 * local-first trust model as the other stores). Only DELTAS from the catalog defaults are
 * stored, so a new feature added to PROJECT_FEATURES gets its default everywhere without a
 * migration. Auto-Review's switch is NOT stored here — the AutoReviewStore stays its single
 * source of truth; the settings endpoint composes the two.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FEATURE_BY_ID, PROJECT_FEATURES, type ProjectFeatureId, type ProjectFeatureMap } from '@ado/shared';

type Stored = Record<string, Partial<Record<ProjectFeatureId, boolean>>>;

export class ProjectSettingsStore {
  private data: Stored = {};

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Stored;
    } catch {
      this.data = {}; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  /** The switch for one feature — stored value, else the catalog default. */
  isEnabled(repoId: string, feature: ProjectFeatureId): boolean {
    return this.data[repoId]?.[feature] ?? FEATURE_BY_ID[feature].defaultOn;
  }

  set(repoId: string, feature: ProjectFeatureId, enabled: boolean): void {
    this.data[repoId] = { ...this.data[repoId], [feature]: enabled };
    this.persist();
  }

  /** Full map for a repo (every catalog feature present, defaults applied). */
  map(repoId: string): ProjectFeatureMap {
    return Object.fromEntries(
      PROJECT_FEATURES.map((f) => [f.id, this.isEnabled(repoId, f.id)]),
    ) as ProjectFeatureMap;
  }
}
