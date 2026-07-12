/**
 * Automations store — per-repo saved recipes, persisted to a gitignored JSON file under
 * data/ (same local-first trust model as prompts.json/connections.json). Holds only user
 * data; the built-in TEMPLATES live in @ado/shared and are merged in the UI.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AutomationInput, type Automation } from '@ado/shared';

export class AutomationStore {
  private data: Record<string, Automation> = {};

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, Automation>;
    } catch {
      this.data = {}; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
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
    this.data[id] = automation;
    this.persist();
    return automation;
  }

  remove(id: string): boolean {
    if (!this.data[id]) return false;
    delete this.data[id];
    this.persist();
    return true;
  }

  /** Record that an automation ran (id of the dispatched run + when). */
  markRun(id: string, runId: string, atTs: string): void {
    const a = this.data[id];
    if (!a) return;
    a.lastRunTs = atTs;
    a.lastRunId = runId;
    this.persist();
  }
}
