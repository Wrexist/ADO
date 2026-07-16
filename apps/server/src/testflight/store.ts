/**
 * TestFlight profile store — saved, named deploy templates per repo, persisted to a
 * gitignored JSON file under data/ (same local-first trust model as automations).
 * Holds config only — credentials are pointers, never key material (shared contract).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TestFlightProfileInput, type TestFlightProfile } from '@ado/shared';

export class TestFlightProfileStore {
  private data: Record<string, TestFlightProfile> = {};

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, TestFlightProfile>;
    } catch {
      this.data = {}; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
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
