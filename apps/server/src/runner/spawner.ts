/**
 * Spawner — the process boundary behind an interface so the runner is testable without
 * the claude CLI. The real impl spawns `claude -p --output-format stream-json` with a
 * MINIMAL env allow-list (never the dashboard's GitHub/Anthropic/ACC secrets — council
 * S12; claude uses its own auth) and a turn cap. POSIX workers use reduced priority.
 */
import type { AgentUpdate } from './adapter';
import { setPriority } from 'node:os';
import { boundedDiagnostics, boundedLines } from '../lib/processOutput';
import { commandFor } from '../lib/processControl';
import { spawnOwned, type ProcessIdentity } from '../lib/ownedProcess';

export interface SpawnOpts {
  cwd: string;
  prompt: string;
  turnCap: number;
  model?: string;
  provider?: string;
  onProcessIdentity?: (identity: ProcessIdentity) => boolean | void;
  receiptRoot?: string;
  secrets?: Array<string | undefined>;
}

export interface SpawnHandle {
  lines: AsyncIterable<string>; // stdout, one JSONL line at a time
  done: Promise<number>; // exit code; rejects if process termination cannot be established
  kill: () => void;
  diagnostics?: () => string;
  updates?: AsyncIterable<AgentUpdate>;
  terminationConfirmed?: () => boolean;
}

export interface Spawner {
  spawn(opts: SpawnOpts): SpawnHandle;
}

/** Env allow-list: only what a child process legitimately needs. NO secrets. */

export class ClaudeSpawner implements Spawner {
  constructor(private readonly executable = (args: string[]) => commandFor('claude', args)) {}
  spawn(opts: SpawnOpts): SpawnHandle {
    const args = [
      '-p',
      opts.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--max-turns',
      String(opts.turnCap),
    ];
    if (opts.model) args.push('--model', opts.model);

    const executable = this.executable(args);
    const owned = spawnOwned(executable.command, executable.args, opts.cwd, opts.onProcessIdentity, opts.receiptRoot);
    const { child, done, kill } = owned;
    child.stdin.end();
    // Best-effort: drop the child's scheduling priority so a build can't pin the box.
    try {
      // On Windows this is the control host, not the agent. Keep its inherited
      // priority so identity and stop handling are not deliberately deprioritized.
      if (process.platform !== 'win32' && child.pid) setPriority(child.pid, 10);
    } catch {
      /* not supported everywhere / needs privileges — non-fatal */
    }

    const lines = boundedLines(child.stdout, kill);
    const diagnostics = boundedDiagnostics(child.stderr, opts.secrets);
    let launchFailed = false;
    child.once('error', () => { launchFailed = true; });
    return { lines, done, kill, diagnostics: () => launchFailed ? 'Claude process could not be started' : diagnostics(), terminationConfirmed: owned.terminationConfirmed };
  }
}
