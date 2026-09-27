/**
 * Automations store — per-repo saved recipes, persisted to a gitignored JSON file under
 * data/ (same local-first trust model as prompts.json/connections.json). Holds only user
 * data; the built-in TEMPLATES live in @ado/shared and are merged in the UI.
 */
import { readJsonStore, writeJsonStore } from '../lib/jsonStore';
import { createHash, randomUUID } from 'node:crypto';
import { AutomationInput, type Automation } from '@ado/shared';
import { ConnectionFile } from '../connections/file';

export function canProjectAutomationHistory(definition: Automation | undefined, runId: string, acceptedTs: string) {
  const oldTime = definition?.lastRunTs ? Date.parse(definition.lastRunTs) : NaN, acceptedTime = Date.parse(acceptedTs);
  return Number.isFinite(acceptedTime) && (!definition?.lastRunId || definition.lastRunId === runId || (Number.isFinite(oldTime) && oldTime < acceptedTime));
}

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

  private recoverySnapshot() {
    try {
      const file = new ConnectionFile(this.filePath), rows = file.read();
      const content = JSON.stringify(rows);
      if (content !== JSON.stringify(this.data)) throw new Error('Changed automation definitions');
      return { file, digest: createHash('sha256').update(content).digest('hex') };
    } catch { throw new Error('Automation definitions changed or are unreadable. Preserve the file and reopen this recovery profile.'); }
  }

  recoveryDigest() { return this.recoverySnapshot().digest; }

  /** Guarded recovery projection; a pending SQLite receipt remains until separately audited. */
  recordRecoveredRun(id: string, runId: string, atTs: string) {
    const a = this.data[id];
    if (!a) throw new Error('Automation definition is missing');
    if (!canProjectAutomationHistory(a, runId, atTs)) throw new Error('Existing automation history is newer or ambiguous; preserve it for separate review');
    this.markRun(id, runId, atTs);
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
    const { file } = this.recoverySnapshot();
    if (a.lastRunId === runId && a.lastRunTs === atTs) return;
    const next = { ...this.data, [id]: { ...a, lastRunTs: atTs, lastRunId: runId } };
    file.write(next); this.data = next;
  }
}
