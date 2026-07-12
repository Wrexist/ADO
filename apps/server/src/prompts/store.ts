/**
 * Custom prompt store — the user's own library entries, persisted to a gitignored JSON
 * file under data/ (same local-first trust model as connections.json). Built-in prompts
 * live in @ado/shared and are never stored here; this holds only what the user adds, so
 * the API stays small and the built-ins can evolve in code without a migration.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CustomPromptInput,
  type CustomPromptInputT,
  type PromptTemplate,
} from '@ado/shared';

interface StoredPrompt extends PromptTemplate {
  custom: true;
  updatedTs: string;
}

/** Stable, collision-resistant id from a title (custom- prefix keeps it clear of built-ins). */
function slugId(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 7);
  return `custom-${base || 'prompt'}-${suffix}`;
}

export class PromptStore {
  private data: Record<string, StoredPrompt> = {};

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      this.data = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, StoredPrompt>;
    } catch {
      this.data = {}; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  /** All custom prompts, newest first. */
  list(): PromptTemplate[] {
    return Object.values(this.data)
      .sort((a, b) => b.updatedTs.localeCompare(a.updatedTs))
      .map(({ updatedTs: _u, ...p }) => p);
  }

  /**
   * Create or update a custom prompt. `input` is validated against the shared schema;
   * an id present + known → update (preserving nothing but the id), else → create.
   * Throws on invalid input (caller maps to 400).
   */
  upsert(raw: unknown): PromptTemplate {
    const input: CustomPromptInputT = CustomPromptInput.parse(raw);
    const id = input.id && this.data[input.id] ? input.id : slugId(input.title);
    const prompt: StoredPrompt = {
      id,
      title: input.title,
      category: input.category,
      tags: input.tags,
      summary: input.summary,
      recommendedModel: input.recommendedModel,
      body: input.body,
      dispatchable: input.dispatchable,
      custom: true,
      updatedTs: new Date().toISOString(),
    };
    this.data[id] = prompt;
    this.persist();
    const { updatedTs: _u, ...out } = prompt;
    return out;
  }

  /** Remove a custom prompt. Returns false if it didn't exist. */
  remove(id: string): boolean {
    if (!this.data[id]) return false;
    delete this.data[id];
    this.persist();
    return true;
  }

  has(id: string): boolean {
    return Boolean(this.data[id]);
  }
}
