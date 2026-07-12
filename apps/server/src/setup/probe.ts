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

/** Tools that gate one-click install — detected once per probe run. */
export interface Capabilities {
  code: boolean; // VS Code `code` CLI (extension installs)
  brew: boolean; // Homebrew (formula + cask installs)
  claude: boolean; // Claude Code CLI (sign-in)
}

const ranOk = (r: ExecResult) => !r.failed && r.code === 0;

export async function detectCapabilities(): Promise<Capabilities> {
  const [code, brew, claude] = await Promise.all([
    exec('code', ['--version'], 5000).then(ranOk),
    exec('brew', ['--version'], 5000).then(ranOk),
    exec('claude', ['--version'], 5000).then(ranOk),
  ]);
  return { code, brew, claude };
}

/** Can the server one-click this requirement given what's present on the machine? */
function installableFor(req: Requirement, caps: Capabilities): boolean {
  switch (req.install.via) {
    case 'npm-global':
      return true;
    case 'vscode-ext':
      return caps.code;
    case 'brew':
    case 'brew-cask':
      return caps.brew;
    case 'claude-login':
      return caps.claude;
    default:
      return false;
  }
}

/** Probe one requirement. Pure w.r.t. ctx; spawns for command/vscode-ext/claude-auth detectors. */
export async function probeOne(
  req: Requirement,
  ctx: ProbeContext,
  checkedTs: string,
  caps: Capabilities,
): Promise<ProbeResult> {
  const base = { id: req.id, checkedTs };
  const installable = installableFor(req, caps);
  const d = req.detect;

  if (d.via === 'manual') {
    return { ...base, status: 'manual', version: null, detail: null, installable };
  }
  if (d.via === 'env') {
    const ok = ctx.envHas(d.envVar);
    return { ...base, status: ok ? 'installed' : 'missing', version: null, detail: ok ? null : `${d.envVar} is not set`, installable };
  }
  if (d.via === 'connection') {
    const ok = ctx.connectionConnected(d.connectionId);
    return { ...base, status: ok ? 'installed' : 'missing', version: null, detail: null, installable };
  }
  if (d.via === 'claude-auth') {
    const r = await exec('claude', ['auth', 'status'], 8000);
    if (r.failed) {
      return { ...base, status: 'missing', version: null, detail: 'the `claude` CLI is not installed — install it first', installable };
    }
    let loggedIn = r.code === 0;
    try {
      const parsed = JSON.parse(r.out) as { loggedIn?: boolean };
      if (typeof parsed.loggedIn === 'boolean') loggedIn = parsed.loggedIn;
    } catch {
      /* older CLI without JSON output — fall back to the exit code */
    }
    return { ...base, status: loggedIn ? 'installed' : 'missing', version: null, detail: loggedIn ? null : 'not signed in — click Sign in', installable };
  }
  if (d.via === 'vscode-ext') {
    const r = await exec('code', ['--list-extensions'], 6000);
    if (r.failed) {
      return { ...base, status: 'missing', version: null, detail: 'the `code` CLI was not found — install VS Code first', installable };
    }
    const present = r.out.toLowerCase().includes(d.extensionId.toLowerCase());
    return { ...base, status: present ? 'installed' : 'missing', version: null, detail: null, installable };
  }
  // d.via === 'command'
  const r = await exec(d.command, d.args ?? ['--version'], 6000);
  if (r.failed || (r.code !== null && r.code !== 0)) {
    return { ...base, status: 'missing', version: null, detail: `\`${d.command}\` not found on PATH`, installable };
  }
  return { ...base, status: 'installed', version: parseVersion(r.out, d.versionRe), detail: null, installable };
}

/** Probe every requirement in the catalog (in parallel), detecting capabilities once. */
export async function probeAll(ctx: ProbeContext): Promise<ProbeResult[]> {
  const checkedTs = new Date().toISOString();
  const caps = await detectCapabilities();
  return Promise.all(REQUIREMENTS.map((r) => probeOne(r, ctx, checkedTs, caps)));
}
