/**
 * Per-project feature switches — persisted to a gitignored JSON file under data/ (same
 * local-first trust model as the other stores). Only DELTAS from the catalog defaults are
 * stored, so a new feature added to PROJECT_FEATURES gets its default everywhere without a
 * migration. Auto-Review's switch is NOT stored here — the AutoReviewStore stays its single
 * source of truth; the settings endpoint composes the two.
 */
import { FEATURE_BY_ID, PROJECT_FEATURES, type ProjectFeatureId, type ProjectFeatureMap } from '@ado/shared';
import { readJsonStoreRows, writeJsonStore } from '../lib/jsonStore';

type Stored = Record<string, Partial<Record<ProjectFeatureId, boolean>>>;

export class ProjectSettingsStore {
  private data: Stored = {};

  constructor(private filePath: string) {
    // ENOENT = fresh install; corruption throws (never silently reset); malformed rows drop.
    this.data = readJsonStoreRows(this.filePath, (row) => {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) return null;
      const deltas: Partial<Record<ProjectFeatureId, boolean>> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k in FEATURE_BY_ID && typeof v === 'boolean') deltas[k as ProjectFeatureId] = v;
      }
      return deltas;
    });
  }

  private persist(): void {
    writeJsonStore(this.filePath, this.data);
  }

  /** The switch for one feature — stored value, else the catalog default. */
  isEnabled(repoId: string, feature: ProjectFeatureId): boolean {
    return this.data[repoId]?.[feature] ?? FEATURE_BY_ID[feature].defaultOn;
  }

  set(repoId: string, feature: ProjectFeatureId, enabled: boolean): void {
    const next = { ...this.data[repoId] };
    // Store DELTAS only: setting a switch back to its catalog default removes the override,
    // so future default changes reach this repo (the documented migration behavior).
    if (enabled === FEATURE_BY_ID[feature].defaultOn) delete next[feature];
    else next[feature] = enabled;
    if (Object.keys(next).length === 0) delete this.data[repoId];
    else this.data[repoId] = next;
    this.persist();
  }

  /** Full map for a repo (every catalog feature present, defaults applied). */
  map(repoId: string): ProjectFeatureMap {
    return Object.fromEntries(
      PROJECT_FEATURES.map((f) => [f.id, this.isEnabled(repoId, f.id)]),
    ) as ProjectFeatureMap;
  }
}
