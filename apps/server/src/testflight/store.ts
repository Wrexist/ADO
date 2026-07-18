/**
 * TestFlight profile store — saved, named deploy templates per repo, persisted to a
 * gitignored JSON file under data/ (same local-first trust model as automations).
 * Holds config only — credentials are pointers, never key material (shared contract).
 */
import { randomUUID } from 'node:crypto';
import { TestFlightProfile, TestFlightProfileInput } from '@ado/shared';
import { readJsonStoreRows, writeJsonStore } from '../lib/jsonStore';

export class TestFlightProfileStore {
  private data: Record<string, TestFlightProfile> = {};

  constructor(private filePath: string) {
    // ENOENT = fresh; corruption throws (never silently reset); schema-invalid rows drop
    // from memory only — the file is untouched until the next real write.
    this.data = readJsonStoreRows(this.filePath, (row) => {
      const parsed = TestFlightProfile.safeParse(row);
      return parsed.success ? parsed.data : null;
    });
  }

  private persist(): void {
    writeJsonStore(this.filePath, this.data);
  }

  list(): TestFlightProfile[] {
    return Object.values(this.data).sort((a, b) => b.createdTs.localeCompare(a.createdTs));
  }

  listForRepo(repoId: string): TestFlightProfile[] {
    return this.list().filter((p) => p.repoId === repoId);
  }

  get(id: string): TestFlightProfile | undefined {
    return this.data[id];
  }

  /** Create or update (validated against the shared schema — throws on bad input). */
  upsert(input: unknown): TestFlightProfile {
    const parsed = TestFlightProfileInput.parse(input);
    const existing = parsed.id ? this.data[parsed.id] : undefined;
    const id = existing?.id ?? randomUUID();
    const { id: _drop, ...fields } = parsed;
    const profile: TestFlightProfile = {
      ...fields,
      id,
      createdTs: existing?.createdTs ?? new Date().toISOString(),
      lastDeployTs: existing?.lastDeployTs ?? null,
      lastDeployRunId: existing?.lastDeployRunId ?? null,
      lastVersion: existing?.lastVersion ?? null,
    };
    this.data[id] = profile;
    this.persist();
    return profile;
  }

  remove(id: string): boolean {
    if (!this.data[id]) return false;
    delete this.data[id];
    this.persist();
    return true;
  }

  /** Record a dispatched deploy (run id + the version that went out). */
  markDeployed(id: string, runId: string, versionLabel: string, atTs: string): void {
    const p = this.data[id];
    if (!p) return;
    p.lastDeployTs = atTs;
    p.lastDeployRunId = runId;
    p.lastVersion = versionLabel;
    this.persist();
  }
}
