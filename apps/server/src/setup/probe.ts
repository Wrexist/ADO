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
import { processEnv, toolCommand } from '../lib/processControl';
import { CONTROL_OS_RUNTIME, supportsControlOSRuntime, REQUIREMENTS, type ConnectionStatus, type ProbeResult, type Requirement } from '@ado/shared';

export interface ProbeContext {
  /** Configuration is not authentication; checks may expire between reads. */
  connectionStatus: (id: string) => Pick<ConnectionStatus, 'configured' | 'authentication' | 'checkedTs'> & Partial<Pick<ConnectionStatus, 'verificationMessage'>>;
  /** Does the running server have this env var set (non-empty)? */
  envHas: (name: string) => boolean;
  runtimeVersion?: string;
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
      // processEnv: an allow-list without secrets, but with USERPROFILE/APPDATA so a CLI
      // launched from the desktop app finds its own sign-in on Windows.
      const tool = toolCommand(command, args);
      child = spawn(tool.command, tool.args, { env: processEnv(), shell: tool.shell, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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

/** Configuration read live on every Setup request (cheap; changes without a re-probe). */
export function envProbe(req: Requirement, ctx: ProbeContext, checkedTs: string): ProbeResult {
  if (req.detect.via !== 'env') throw new Error('Environment detector required');
  const ok = ctx.envHas(req.detect.envVar);
  const unset = req.detect.envVar === 'PROJECT_DIRS' ? 'No project folder added yet.' : `${req.detect.envVar} is not set`;
  return { id: req.id, status: ok ? 'installed' : 'missing', version: null, detail: ok ? null : unset, installable: false, checkedTs };
}

export function connectionProbe(req: Requirement, ctx: ProbeContext, checkedTs: string): ProbeResult {
  if (req.detect.via !== 'connection') throw new Error('Connection detector required');
  const state = ctx.connectionStatus(req.detect.connectionId);
  // The provider's own explanation (login, scopes, rejection reason) is the most useful detail.
  const provider = state.verificationMessage ? `${state.verificationMessage} ` : '';
  const detail = !state.configured ? 'No credential configured. Add it in Settings.' : {
    verified: provider || 'Credential accepted by the provider. ',
    rejected: `${provider || 'Credential rejected. '}Replace it in Settings.`,
    stale: 'The last check has expired. Opening Settings checks it again.',
    unverified: 'Credential saved, but not checked yet. Opening Settings checks it.',
    unavailable: `${provider || 'The provider could not be reached. '}Retry from Settings.`,
    unsupported: 'Provider verification is not supported for this connector.',
  }[state.authentication].trim();
  return { id: req.id, status: !state.configured ? 'missing' : state.authentication === 'verified' ? 'verified' : 'configured', version: null,
    detail: detail + (state.configured && state.checkedTs ? ` Checked ${state.checkedTs}.` : ''), installable: false, checkedTs };
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

  if (d.via === 'server-runtime') {
    const version = ctx.runtimeVersion ?? process.versions.node;
    const supported = supportsControlOSRuntime(version);
    return { ...base, status: supported ? 'installed' : 'manual', version,
      detail: supported ? 'Running server runtime meets the declared minimum.' : `Unsupported running server runtime. Requires ${CONTROL_OS_RUNTIME}; restart with a supported runtime.`, installable: false };
  }

  if (d.via === 'manual') {
    return { ...base, status: 'manual', version: null, detail: null, installable };
  }
  if (d.via === 'env') return envProbe(req, ctx, checkedTs);
  if (d.via === 'connection') {
    return connectionProbe(req, ctx, checkedTs);
  }
  if (d.via === 'claude-auth') {
    const r = await exec('claude', ['auth', 'status'], 8000);
    if (r.failed) {
      return { ...base, status: 'missing', version: null, detail: 'the `claude` CLI is not installed — install it first', installable };
    }
    let loggedIn = r.code === 0;
    let authMethod: string | null = null;
    try {
      const parsed = JSON.parse(r.out) as { loggedIn?: boolean; authMethod?: unknown };
      if (typeof parsed.loggedIn === 'boolean') loggedIn = parsed.loggedIn;
      if (typeof parsed.authMethod === 'string') authMethod = parsed.authMethod.slice(0, 40);
    } catch {
      /* older CLI without JSON output — fall back to the exit code */
    }
    // Agents run only on a Claude subscription sign-in (T32); say so before a run is refused.
    if (loggedIn && authMethod && authMethod !== 'claude.ai') {
      return { ...base, status: 'configured', version: null, detail: `Signed in with ${authMethod}, which bills per use. ControlOS runs agents only with a Claude subscription: click Sign in and choose your Claude account.`, installable };
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
