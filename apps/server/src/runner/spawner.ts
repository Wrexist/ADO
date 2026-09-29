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
  /** A synchronous exception is an unknown process outcome unless preflight
   * explicitly throws ProcessNotStartedError before attempting process creation. */
  spawn(opts: SpawnOpts): SpawnHandle;
}

/** Env allow-list: only what a child process legitimately needs. NO secrets. */

export const CLAUDE_POLICY_ARGS: readonly string[] = [
  '-p', '--output-format', 'stream-json', '--verbose',
  '--setting-sources', 'user',
  '--strict-mcp-config',
];

export class ClaudeSpawner implements Spawner {
  constructor(private readonly executable = (args: string[]) => commandFor('claude', args)) {}
  spawn(opts: SpawnOpts): SpawnHandle {
    // The prompt goes over stdin: it can carry untrusted reference text and exceed the
    // Windows command-line limit, and argv is visible to other local processes.
    // Only the owner's user settings load; settings, hooks and MCP servers committed in
    // the target repository cannot change the agent's policy (T10).
    const args = CLAUDE_POLICY_ARGS.concat(['--max-turns', String(opts.turnCap)]);
    if (opts.model) args.push('--model', opts.model);

    const executable = this.executable(args);
    const owned = spawnOwned(executable.command, executable.args, opts.cwd, opts.onProcessIdentity, opts.receiptRoot);
    const { child, done, kill } = owned;
    child.stdin.on('error', () => { /* child exited before reading; its exit status reports the failure */ });
    child.stdin.end(opts.prompt);
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
