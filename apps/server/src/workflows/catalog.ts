/**
 * Workflow catalog reader — parses the `meta` block out of each `.claude/workflows/*.js`
 * recipe so the app can VISUALISE them. Reading the real files is deliberate: the visual
 * can never claim a workflow that doesn't exist or show stale phases, because there's no
 * hand-maintained copy (no-fabrication rule). A file whose meta can't be parsed is skipped,
 * not guessed at.
 *
 * These files are first-party repo content, not user input. We extract ONLY the balanced
 * `{…}` literal right after `export const meta =` and evaluate that isolated literal — the
 * rest of the script body (which references harness-injected globals) is never executed.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkflowMeta, WorkflowPhase } from '@ado/shared';

// Preferred display order = the lifecycle (understand → plan → review → gate). Unknowns last.
const ORDER = ['understand', 'ship-feature', 'review', 'audit', 'harden', 'verify-gate'];

/** Extract + validate the meta object from one workflow file's source. Null if unparseable. */
export function extractMeta(src: string, file: string): WorkflowMeta | null {
  const m = src.match(/export\s+const\s+meta\s*=\s*/);
  if (!m || m.index === undefined) return null;
  const open = src.indexOf('{', m.index + m[0].length);
  if (open < 0) return null;

  // Balanced-brace scan that ignores braces inside strings.
  let depth = 0;
  let end = -1;
  let inStr: string | null = null;
  for (let p = open; p < src.length; p++) {
    const ch = src[p];
    const prev = src[p - 1];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') inStr = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      end = p;
      break;
    }
  }
  if (end < 0) return null;

  let obj: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    obj = new Function(`return (${src.slice(open, end + 1)});`)();
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.name !== 'string' || typeof o.description !== 'string') return null;

  const phases: WorkflowPhase[] = Array.isArray(o.phases)
    ? o.phases
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).title === 'string')
        .map((p) => ({ title: String(p.title), detail: typeof p.detail === 'string' ? p.detail : undefined }))
    : [];

  return {
    name: o.name,
    description: o.description,
    whenToUse: typeof o.whenToUse === 'string' ? o.whenToUse : undefined,
    phases,
    file,
  };
}

/** Read + parse every workflow recipe in a directory, in lifecycle order. */
export function readWorkflows(dir: string): WorkflowMeta[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  } catch {
    return []; // no directory → honest empty catalog
  }
  const metas: WorkflowMeta[] = [];
  for (const file of files) {
    try {
      const meta = extractMeta(readFileSync(join(dir, file), 'utf8'), file);
      if (meta) metas.push(meta);
    } catch {
      /* unreadable file — skip honestly */
    }
  }
  return metas.sort((a, b) => {
    const ai = ORDER.indexOf(a.name);
    const bi = ORDER.indexOf(b.name);
    return (ai < 0 ? ORDER.length : ai) - (bi < 0 ? ORDER.length : bi) || a.name.localeCompare(b.name);
  });
}

/**
 * Locate `.claude/workflows` regardless of the process cwd (the server may start from the
 * repo root or from apps/server). Walk up from both cwd and this module's dir.
 */
export function findWorkflowsDir(): string | null {
  const starts = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const start of starts) {
    let cur = resolve(start);
    for (let i = 0; i < 8; i++) {
      const candidate = join(cur, '.claude', 'workflows');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  return null;
}
