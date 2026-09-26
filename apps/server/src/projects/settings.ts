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
    // Invalid policy must not silently restore permissive catalog defaults.
    this.data = readJsonStoreRows(this.filePath, (row) => {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid project policy');
      const deltas: Partial<Record<ProjectFeatureId, boolean>> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!Object.hasOwn(FEATURE_BY_ID, k) || typeof v !== 'boolean') throw new Error('Invalid project policy');
        deltas[k as ProjectFeatureId] = v;
      }
      return deltas;
    });
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
    const data = { ...this.data };
    if (Object.keys(next).length === 0) delete data[repoId];
    else Object.defineProperty(data, repoId, { value: next, enumerable: true, configurable: true, writable: true });
    writeJsonStore(this.filePath, data);
    this.data = data;
  }

  /** Full map for a repo (every catalog feature present, defaults applied). */
  map(repoId: string): ProjectFeatureMap {
    return Object.fromEntries(
      PROJECT_FEATURES.map((f) => [f.id, this.isEnabled(repoId, f.id)]),
    ) as ProjectFeatureMap;
  }
}
