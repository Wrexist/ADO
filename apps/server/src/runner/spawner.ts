/**
 * Spawner — the process boundary behind an interface so the runner is testable without
 * the claude CLI. The real impl spawns `claude -p --output-format stream-json` with a
 * MINIMAL env allow-list (never the dashboard's GitHub/Anthropic/ACC secrets — council
 * S12; claude uses its own auth) and a turn cap, at reduced OS priority.
 */
import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';
import { createInterface } from 'node:readline';

export interface SpawnOpts {
  cwd: string;
  prompt: string;
  turnCap: number;
  model?: string;
}

export interface SpawnHandle {
  lines: AsyncIterable<string>; // stdout, one JSONL line at a time
  done: Promise<number>; // exit code (or -1 if killed)
  kill: () => void;
}

export interface Spawner {
  spawn(opts: SpawnOpts): SpawnHandle;
}

/** Env allow-list: only what a child process legitimately needs. NO secrets. */
function minimalEnv(): NodeJS.ProcessEnv {
  const { PATH, HOME, USER, LANG, TERM, TMPDIR } = process.env;
  return { PATH, HOME, USER, LANG, TERM, TMPDIR };
}

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

    const child = spawn('claude', args, {
      cwd: opts.cwd,
      env: minimalEnv(),
      // stderr → 'ignore' (not 'pipe'): we consume only stdout (the stream-json line
      // protocol) via readline. A piped-but-unread stderr deadlocks the child once it
      // exceeds the OS pipe buffer (~64KB of verbose/auth diagnostics), so the run would
      // hang until the wall-clock timeout. Merging stderr into stdout would corrupt the
      // JSONL, so we drop it at the OS level instead.
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // Best-effort: drop the child's scheduling priority so a build can't pin the box.
    try {
      if (child.pid) setPriority(child.pid, 10);
    } catch {
      /* not supported everywhere / needs privileges — non-fatal */
    }

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const done = new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code ?? -1));
      child.on('error', () => resolve(-1)); // e.g. claude not installed
    });

    return { lines: rl, done, kill: () => child.kill('SIGTERM') };
  }
}
