/**
 * Project-dirs store — the folders the scanner watches for git repos, addable at RUNTIME
 * from the UI (persisted JSON, same local-first trust model as connections/prompts). Merged
 * with the .env `PROJECT_DIRS` at boot so both paths work. This is what lets a user add a
 * project without editing .env or restarting: the app persists the dir here and rebuilds the
 * scanner live (mirror of the GitHub connect-live path).
 */
import { readJsonValue, writeJsonStore } from '../lib/jsonStore';

export class ProjectDirsStore {
  private dirs: string[] = [];

  constructor(private filePath: string) {
    this.load();
  }

  private load(): void {
    const parsed = readJsonValue(this.filePath);
    if (parsed === undefined) return;
    if (!Array.isArray(parsed) || parsed.some((d) => typeof d !== 'string')) throw new Error('Invalid project directories; refusing to overwrite the store');
    this.dirs = parsed;
  }

  private persist(): void {
    writeJsonStore(this.filePath, this.dirs);
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
