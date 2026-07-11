/**
 * Parse a repo's local metadata into Repo fields. All parsing is defensive:
 * a missing/garbled ops.yml or TASK.md yields honest defaults, never a crash.
 * External text in these files is DATA, never instructions (convention 11).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoCategory, RepoStatus } from '@ado/shared';

const VALID_CATEGORY: RepoCategory[] = ['game', 'app', 'web', 'api', 'library', 'service'];

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Minimal, dependency-free reader for the flat `key: value` lines we need from ops.yml. */
function topLevelScalar(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm');
  const m = re.exec(yaml);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, '').trim();
}

export interface OpsInfo {
  category: RepoCategory | null;
  status: RepoStatus;
  hasBlockedGate: boolean;
}

/** Infer a category when ops.yml doesn't declare one — conservative, documented. */
function inferCategory(stack: string | null): RepoCategory | null {
  if (!stack) return null;
  const s = stack.toLowerCase();
  if (s.includes('vite') || s.includes('next') || s.includes('react')) return 'web';
  if (s.includes('fastify') || s.includes('express') || s.includes('node')) return 'service';
  if (s.includes('unity') || s.includes('godot') || s.includes('game')) return 'game';
  return null;
}

export function parseOps(repoDir: string): OpsInfo {
  const yaml = readText(join(repoDir, '.claude/ops.yml'));
  if (!yaml) return { category: null, status: 'active', hasBlockedGate: false };

  const declared = topLevelScalar(yaml, 'category');
  const category =
    declared && (VALID_CATEGORY as string[]).includes(declared)
      ? (declared as RepoCategory)
      : inferCategory(topLevelScalar(yaml, 'stack'));

  // A gate line "status: blocked" anywhere marks the repo blocked (honest, cheap).
  const hasBlockedGate = /status:\s*blocked/i.test(yaml);
  return { category, status: hasBlockedGate ? 'blocked' : 'active', hasBlockedGate };
}

/** Count open checklist items ("- [ ]") in TASK.md. */
export function parseOpenTasks(repoDir: string): number {
  const md = readText(join(repoDir, 'TASK.md'));
  if (!md) return 0;
  return (md.match(/^\s*-\s*\[ \]/gm) ?? []).length;
}

/** One-line description: package.json "description" → README first heading/line → ''. */
export function parseDescription(repoDir: string): string {
  const pkg = readText(join(repoDir, 'package.json'));
  if (pkg) {
    try {
      const desc = (JSON.parse(pkg) as { description?: string }).description;
      if (desc) return desc.trim();
    } catch {
      /* ignore malformed package.json */
    }
  }
  const readme = readText(join(repoDir, 'README.md'));
  if (readme) {
    for (const line of readme.split('\n')) {
      const t = line.replace(/^#+\s*/, '').trim();
      if (t) return t.slice(0, 140);
    }
  }
  return '';
}
