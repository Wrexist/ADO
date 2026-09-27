/**
 * Automations store — per-repo saved recipes, persisted to a gitignored JSON file under
 * data/ (same local-first trust model as prompts.json/connections.json). Holds only user
 * data; the built-in TEMPLATES live in @ado/shared and are merged in the UI.
 */
import { readJsonStore, writeJsonStore } from '../lib/jsonStore';
import { randomUUID } from 'node:crypto';
import { AutomationInput, type Automation } from '@ado/shared';

export class AutomationStore {
  private data: Record<string, Automation> = {};

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    const rows = readJsonStore(this.filePath) ?? {};
    for (const [id, row] of Object.entries(rows)) {
      if (!AutomationInput.safeParse(row).success || typeof (row as Automation).createdTs !== 'string' || (row as Automation).id !== id) {
        throw new Error(`Invalid automation '${id}'; refusing to overwrite the store`);
      }
    }
    this.data = rows as Record<string, Automation>;
  }

  private persist(next: Record<string, Automation>): void {
    writeJsonStore(this.filePath, next);
    this.data = next;
  }

  /** All automations, newest first. */
  list(): Automation[] {
    return Object.values(this.data).sort((a, b) => b.createdTs.localeCompare(a.createdTs));
  }

  listForRepo(repoId: string): Automation[] {
    return this.list().filter((a) => a.repoId === repoId);
  }

  get(id: string): Automation | undefined {
    return this.data[id];
  }

  /** Create or update. Validates against the shared schema (throws on bad input). */
  upsert(input: unknown): Automation {
    const parsed = AutomationInput.parse(input);
    const existing = parsed.id ? this.data[parsed.id] : undefined;
    const id = existing?.id ?? randomUUID();
    const automation: Automation = {
      id,
      repoId: parsed.repoId,
      name: parsed.name,
      task: parsed.task,
      model: parsed.model,
      trigger: parsed.trigger,
      enabled: parsed.enabled,
      source: parsed.source,
      createdTs: existing?.createdTs ?? new Date().toISOString(),
      lastRunTs: existing?.lastRunTs ?? null,
      lastRunId: existing?.lastRunId ?? null,
    };
    this.persist({ ...this.data, [id]: automation });
    return automation;
  }

  remove(id: string): boolean {
    if (!this.data[id]) return false;
    const next = { ...this.data }; delete next[id];
    this.persist(next);
    return true;
  }

  /** Record that an automation ran (id of the dispatched run + when). */
  markRun(id: string, runId: string, atTs: string): void {
    const a = this.data[id];
    if (!a) return;
    this.persist({ ...this.data, [id]: { ...a, lastRunTs: atTs, lastRunId: runId } });
  }
}
