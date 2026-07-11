/**
 * Scanner (Prompt 2.2): discover git repos under PROJECT_DIRS, read git + ops.yml +
 * TASK.md, and emit repo.upserted events. Watches only ops.yml/TASK.md with a debounce
 * and an ignore-list — a recursive watch over 20 repos would exhaust file descriptors
 * (council S4).
 *
 * Scanner owns BASE repo fields (name, category, status, branch, updatedTs, description,
 * openTasks); it never sends `agents`/`ci`/`stars` — those are enrichment from the
 * runner (P3) and GitHub (2.3), merged by the reducer.
 */
import { lstatSync, readdirSync, watch, type FSWatcher } from 'node:fs';
import { basename, join } from 'node:path';
import type { RepoCategory } from '@ado/shared';
import type { Bus } from '../bus';
import { isGitRepo, readGit } from './git';
import { parseDescription, parseOpenTasks, parseOps } from './parse';

const IGNORE = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', '.vite']);
const WATCH_FILES = new Set(['ops.yml', 'TASK.md']);
const DEBOUNCE_MS = 2500;

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Immediate subdirectories of a root (depth 1) — repos live one level down. */
function subdirs(root: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    if (IGNORE.has(name) || name.startsWith('.')) continue;
    const full = join(root, name);
    try {
      const st = lstatSync(full); // lstat: do NOT follow symlinks (avoid loops, council S4)
      if (st.isDirectory()) out.push(full);
    } catch {
      /* unreadable entry — skip */
    }
  }
  return out;
}

export class Scanner {
  private watchers: FSWatcher[] = [];
  private timers = new Map<string, NodeJS.Timeout>();
  private repoDirs = new Set<string>();

  constructor(
    private bus: Bus,
    private projectDirs: string[],
    private log: (msg: string) => void = () => {},
  ) {}

  /** Full scan of every configured root, then install watches. */
  async start(): Promise<void> {
    for (const root of this.projectDirs) {
      for (const dir of subdirs(root)) {
        if (await isGitRepo(dir)) {
          this.repoDirs.add(dir);
          await this.scanRepo(dir);
        }
      }
    }
    this.installWatches();
    this.log(`scanner: ${this.repoDirs.size} repo(s) under ${this.projectDirs.length} dir(s)`);
  }

  private async scanRepo(dir: string): Promise<void> {
    try {
      const git = await readGit(dir);
      const ops = parseOps(dir);
      const id = slug(basename(dir));
      this.bus.publish({
        id: `scan:${id}`,
        type: 'repo.upserted',
        ts: new Date().toISOString(),
        source: { kind: 'scanner', ref: dir },
        payload: {
          repo: {
            id,
            name: basename(dir),
            category: (ops.category ?? 'app') as RepoCategory,
            status: ops.status,
            description: parseDescription(dir),
            branch: git.branch,
            updatedTs: git.lastCommitTs ?? new Date().toISOString(),
            openTasks: parseOpenTasks(dir),
          },
        },
      });
    } catch (err) {
      this.log(`scanner: failed to scan ${dir}: ${(err as Error).message}`);
    }
  }

  /** Watch each repo root non-recursively; react only to ops.yml/TASK.md, debounced. */
  private installWatches(): void {
    for (const dir of this.repoDirs) {
      for (const sub of ['.', '.claude']) {
        try {
          const target = sub === '.' ? dir : join(dir, sub);
          const w = watch(target, { persistent: false }, (_evt, filename) => {
            if (filename && WATCH_FILES.has(basename(filename.toString()))) this.debouncedRescan(dir);
          });
          this.watchers.push(w);
        } catch {
          /* .claude may not exist — fine */
        }
      }
    }
  }

  private debouncedRescan(dir: string): void {
    const existing = this.timers.get(dir);
    if (existing) clearTimeout(existing);
    this.timers.set(
      dir,
      setTimeout(() => {
        this.timers.delete(dir);
        void this.scanRepo(dir);
      }, DEBOUNCE_MS),
    );
  }

  stop(): void {
    for (const w of this.watchers) w.close();
    for (const t of this.timers.values()) clearTimeout(t);
    this.watchers = [];
    this.timers.clear();
  }
}
