/**
 * Spawner — the process boundary behind an interface so the runner is testable without
 * the claude CLI. The real impl spawns `claude -p --output-format stream-json` with a
 * MINIMAL env allow-list (never the dashboard's GitHub/Anthropic/ACC secrets — council
 * S12; claude uses its own auth) and a turn cap, at reduced OS priority.
 */
import type { AgentUpdate } from './adapter';
import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';
import { createInterface } from 'node:readline';
import { commandFor, processEnv, supervise } from '../lib/processControl';

export interface SpawnOpts {
  cwd: string;
  prompt: string;
  turnCap: number;
  model?: string;
  provider?: string;
}

export interface SpawnHandle {
  lines: AsyncIterable<string>; // stdout, one JSONL line at a time
  done: Promise<number>; // exit code (or -1 if killed)
  kill: () => void;
  diagnostics?: () => string;
  updates?: AsyncIterable<AgentUpdate>;
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
    const child = spawn(executable.command, executable.args, {
      cwd: opts.cwd,
      env: processEnv(),
      windowsHide: true,
      detached: process.platform !== 'win32',
      // Drain stderr separately into a bounded buffer; never mix diagnostics into JSONL.
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Best-effort: drop the child's scheduling priority so a build can't pin the box.
    try {
      if (child.pid) setPriority(child.pid, 10);
    } catch {
      /* not supported everywhere / needs privileges — non-fatal */
    }

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    let diagnostics = '';
    child.stderr.on('data', (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); });
    const kill = supervise(child);
    const done = new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? -1));
      child.on('error', (error) => { diagnostics = error.message; rl.close(); resolve(-1); });
    });

    return { lines: rl, done, kill, diagnostics: () => diagnostics };
  }
}
