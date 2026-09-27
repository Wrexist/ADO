/**
 * Spawner — the process boundary behind an interface so the runner is testable without
 * the claude CLI. The real impl spawns `claude -p --output-format stream-json` with a
 * MINIMAL env allow-list (never the dashboard's GitHub/Anthropic/ACC secrets — council
 * S12; claude uses its own auth) and a turn cap, at reduced OS priority.
 */
import type { AgentUpdate } from './adapter';
import { setPriority } from 'node:os';
import { createInterface } from 'node:readline';
import { commandFor } from '../lib/processControl';
import { spawnOwned, type ProcessIdentity } from '../lib/ownedProcess';

export interface SpawnOpts {
  cwd: string;
  prompt: string;
  turnCap: number;
  model?: string;
  provider?: string;
  onProcessIdentity?: (identity: ProcessIdentity) => boolean | void;
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

    const executable = commandFor('claude', args);
    const owned = spawnOwned(executable.command, executable.args, opts.cwd, opts.onProcessIdentity);
    const { child, done, kill } = owned;
    child.stdin.end();
    // Best-effort: drop the child's scheduling priority so a build can't pin the box.
    try {
      if (child.pid) setPriority(child.pid, 10);
    } catch {
      /* not supported everywhere / needs privileges — non-fatal */
    }

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let diagnostics = '';
    child.stderr.on('data', (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); });
    child.on('error', (error) => { diagnostics = error.message; rl.close(); });

    return { lines: rl, done, kill, diagnostics: () => diagnostics, terminationConfirmed: owned.terminationConfirmed };
  }
}
