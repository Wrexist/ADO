/**
 * Setup probing — detect the REAL status of each requirement on this machine. Every result
 * traces to an actual check (a `--version` spawn, an env var, a stored connection); nothing
 * is assumed. A tool that can't be found renders "missing", never a hopeful "installed"
 * (CLAUDE.md no-fabrication rule applies to the machine state too).
 *
 * Commands come only from the first-party REQUIREMENTS catalog (never client input), run
 * with a minimal env allow-list and a short timeout, so probing is safe and can't hang boot.
 */
import { spawn } from 'node:child_process';
import { REQUIREMENTS, type ProbeResult, type Requirement } from '@ado/shared';

export interface ProbeContext {
  /** Is a connector connected (token/key stored or in .env)? */
  connectionConnected: (id: string) => boolean;
  /** Does the running server have this env var set (non-empty)? */
  envHas: (name: string) => boolean;
}

/** Minimal env for a probe child — never the dashboard's secrets. */
function minimalEnv(): NodeJS.ProcessEnv {
  const { PATH, HOME, USER, LANG, TERM, TMPDIR } = process.env;
  return { PATH, HOME, USER, LANG, TERM, TMPDIR };
}

interface ExecResult {
  code: number | null;
  out: string;
  failed: boolean; // couldn't spawn (not on PATH) or timed out
}

/** Run a command, capture stdout+stderr, never throw, always resolve within timeoutMs. */
export function exec(command: string, args: string[], timeoutMs = 5000): Promise<ExecResult> {
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (r: ExecResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let child;
    try {
      child = spawn(command, args, { env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return done({ code: null, out: '', failed: true });
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      done({ code: null, out, failed: true });
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (out += d.toString())); // many CLIs print --version to stderr
    child.on('error', () => {
      clearTimeout(timer);
      done({ code: null, out, failed: true }); // ENOENT — not installed
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: code ?? null, out, failed: false });
    });
  });
}

function parseVersion(text: string, re?: string): string | null {
  if (!re) return null;
  const m = text.match(new RegExp(re));
  return m ? (m[1] ?? m[0]) : null;
}

/** Can the server auto-install this requirement given the runtime (e.g. is `code` present)? */
function installableFor(req: Requirement, codeCliPresent: boolean): boolean {
  if (req.install.via === 'npm-global') return true;
  if (req.install.via === 'vscode-ext') return codeCliPresent;
  return false;
}

/** Probe one requirement. Pure w.r.t. ctx; spawns for command/vscode-ext detectors. */
export async function probeOne(req: Requirement, ctx: ProbeContext, checkedTs: string): Promise<ProbeResult> {
  const base = { id: req.id, checkedTs };
  const d = req.detect;

  if (d.via === 'manual') {
    return { ...base, status: 'manual', version: null, detail: null, installable: false };
  }
  if (d.via === 'env') {
    const ok = ctx.envHas(d.envVar);
    return { ...base, status: ok ? 'installed' : 'missing', version: null, detail: ok ? null : `${d.envVar} is not set`, installable: false };
  }
  if (d.via === 'connection') {
    const ok = ctx.connectionConnected(d.connectionId);
    return { ...base, status: ok ? 'installed' : 'missing', version: null, detail: null, installable: installableFor(req, false) };
  }
  if (d.via === 'vscode-ext') {
    const r = await exec('code', ['--list-extensions'], 6000);
    if (r.failed) {
      return { ...base, status: 'missing', version: null, detail: 'the `code` CLI was not found — install VS Code first', installable: false };
    }
    const present = r.out.toLowerCase().includes(d.extensionId.toLowerCase());
    return { ...base, status: present ? 'installed' : 'missing', version: null, detail: null, installable: installableFor(req, true) };
  }
  // d.via === 'command'
  const r = await exec(d.command, d.args ?? ['--version'], 6000);
  // For requirements whose auto-install is a vscode extension, "installable" needs the `code`
  // CLI; the vscode item is detected above. Command items install via npm-global or manual.
  const installable = installableFor(req, false);
  if (r.failed || (r.code !== null && r.code !== 0)) {
    return { ...base, status: 'missing', version: null, detail: `\`${d.command}\` not found on PATH`, installable };
  }
  return { ...base, status: 'installed', version: parseVersion(r.out, d.versionRe), detail: null, installable };
}

/** Probe every requirement in the catalog (in parallel). */
export async function probeAll(ctx: ProbeContext): Promise<ProbeResult[]> {
  const checkedTs = new Date().toISOString();
  return Promise.all(REQUIREMENTS.map((r) => probeOne(r, ctx, checkedTs)));
}

/** Is the VS Code `code` CLI available? (used to decide extension auto-install) */
export async function codeCliPresent(): Promise<boolean> {
  const r = await exec('code', ['--version'], 5000);
  return !r.failed && r.code === 0;
}
