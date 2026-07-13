/**
 * Project-dirs store — the folders the scanner watches for git repos, addable at RUNTIME
 * from the UI (persisted JSON, same local-first trust model as connections/prompts). Merged
 * with the .env `PROJECT_DIRS` at boot so both paths work. This is what lets a user add a
 * project without editing .env or restarting: the app persists the dir here and rebuilds the
 * scanner live (mirror of the GitHub connect-live path).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class ProjectDirsStore {
  private dirs: string[] = [];

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown;
      this.dirs = Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
    } catch {
      this.dirs = []; // no file yet — fine
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.dirs, null, 2));
  }

  list(): string[] {
    return [...this.dirs];
  }

  /** Add a dir (deduped). Existence/permission validation is the caller's job (endpoint). */
  add(dir: string): void {
    const d = dir.trim();
    if (!d) throw new Error('path is empty');
    if (!this.dirs.includes(d)) {
      this.dirs.push(d);
      this.persist();
    }
  }

  remove(dir: string): void {
    const before = this.dirs.length;
    this.dirs = this.dirs.filter((d) => d !== dir.trim());
    if (this.dirs.length !== before) this.persist();
  }
}
