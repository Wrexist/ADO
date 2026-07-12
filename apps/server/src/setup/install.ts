/**
 * Setup installer — runs the ONE allow-listed install command for a requirement, on the
 * user's own machine, and tracks progress so the UI can stream it.
 *
 * Trust model (CLAUDE.md §V2 conventions 9-10): the endpoint is token-gated, and the client
 * only ever sends a requirement `id` — the command is derived here from the first-party
 * REQUIREMENTS catalog, never from client input. Runs with a minimal env allow-list and a
 * hard timeout. Only npm-global packages and (when the `code` CLI exists) editor extensions
 * are auto-installable; everything else is guided in the UI, so this can never be asked to
 * run an arbitrary command.
 */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import type { InstallRun, Requirement } from '@ado/shared';
import type { Capabilities } from './probe';

const OUTPUT_CAP = 500; // keep the last N lines — an install log can't grow unbounded in memory
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min — a cask download or a browser sign-in can be slow

/** The exact command for a requirement, or null if it isn't one-click on this machine. */
export function installCommandFor(
  req: Requirement,
  caps: Capabilities,
): { cmd: string; args: string[] } | null {
  switch (req.install.via) {
    case 'npm-global':
      return { cmd: 'npm', args: ['install', '-g', req.install.package] };
    case 'vscode-ext':
      return caps.code ? { cmd: 'code', args: ['--install-extension', req.install.extensionId] } : null;
    case 'brew':
      return caps.brew ? { cmd: 'brew', args: ['install', req.install.formula] } : null;
    case 'brew-cask':
      return caps.brew ? { cmd: 'brew', args: ['install', '--cask', req.install.cask] } : null;
    case 'claude-login':
      // `claude auth login` opens the browser and waits for the OAuth callback — on the
      // user's own machine (local-first) that's their browser. Times out if not completed.
      return caps.claude ? { cmd: 'claude', args: ['auth', 'login'] } : null;
    default:
      return null;
  }
}

function minimalEnv(): NodeJS.ProcessEnv {
  // No dashboard secrets. DISPLAY/BROWSER are added (not secrets) so `claude auth login` can
  // open a browser on a Linux desktop; macOS uses `open` via PATH.
  const { PATH, HOME, USER, LANG, TERM, TMPDIR, DISPLAY, BROWSER } = process.env;
  return { PATH, HOME, USER, LANG, TERM, TMPDIR, DISPLAY, BROWSER };
}

/** A spawn seam so tests can drive the installer without running real npm. */
export interface InstallProc {
  lines: AsyncIterable<string>;
  done: Promise<number>;
  kill: () => void;
}
export type InstallSpawn = (cmd: string, args: string[]) => InstallProc;

const realSpawn: InstallSpawn = (cmd, args) => {
  const child = spawn(cmd, args, { env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  // Merge stdout + stderr into one line stream — installers (npm) print progress to stderr,
  // so a stdout-only log would look empty even on a healthy install.
  const merged = new PassThrough();
  let open = 2;
  const half = () => {
    if (--open === 0) merged.end();
  };
  child.stdout.on('end', half).pipe(merged, { end: false });
  child.stderr.on('end', half).pipe(merged, { end: false });
  const rl = createInterface({ input: merged, crlfDelay: Infinity });
  const done = new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? -1));
    child.on('error', () => resolve(-1)); // e.g. npm/code not on PATH
  });
  return { lines: rl, done, kill: () => child.kill('SIGTERM') };
};

export class Installer {
  private runs = new Map<string, InstallRun>();

  constructor(
    private capabilities: () => Promise<Capabilities>,
    private log: (msg: string) => void = () => {},
    private spawnImpl: InstallSpawn = realSpawn,
  ) {}

  /** Begin an install (returns immediately with a "running" run) or an error if not installable. */
  async start(req: Requirement): Promise<InstallRun | { error: string }> {
    const spec = installCommandFor(req, await this.capabilities());
    if (!spec) return { error: `${req.name} can’t be auto-installed here — use the guided steps instead` };

    const run: InstallRun = {
      runId: randomUUID(),
      reqId: req.id,
      status: 'running',
      command: `${spec.cmd} ${spec.args.join(' ')}`,
      output: [],
      code: null,
      startedTs: new Date().toISOString(),
      endedTs: null,
    };
    this.runs.set(run.runId, run);
    void this.execute(run, spec);
    return run;
  }

  private async execute(run: InstallRun, spec: { cmd: string; args: string[] }): Promise<void> {
    const append = (line: string) => {
      run.output.push(line);
      if (run.output.length > OUTPUT_CAP) run.output.splice(0, run.output.length - OUTPUT_CAP);
    };
    append(`$ ${run.command}`);
    let proc: InstallProc;
    try {
      proc = this.spawnImpl(spec.cmd, spec.args);
    } catch (err) {
      run.status = 'failed';
      run.code = -1;
      run.endedTs = new Date().toISOString();
      append(`failed to start: ${(err as Error).message}`);
      return;
    }
    const timer = setTimeout(() => {
      append(`timed out after ${Math.round(TIMEOUT_MS / 1000)}s — killed`);
      proc.kill();
    }, TIMEOUT_MS);
    try {
      for await (const line of proc.lines) append(line);
    } catch {
      /* stream ended abruptly — the exit code below is the source of truth */
    }
    const code = await proc.done;
    clearTimeout(timer);
    run.code = code;
    run.status = code === 0 ? 'done' : 'failed';
    run.endedTs = new Date().toISOString();
    this.log(`install ${run.reqId}: ${run.status} (exit ${code})`);
  }

  get(runId: string): InstallRun | undefined {
    return this.runs.get(runId);
  }
}
