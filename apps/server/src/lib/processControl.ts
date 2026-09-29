import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join, isAbsolute } from 'node:path';
import { ProcessNotStartedError } from './processLaunch';

const active = new Map<ChildProcess, { kill: () => void; done: Promise<void> }>();

export function processEnv(): NodeJS.ProcessEnv {
  const allowed = new Set(['path', 'home', 'user', 'lang', 'term', 'tmpdir', 'tmp', 'temp',
    'systemroot', 'windir', 'comspec', 'pathext', 'userprofile', 'appdata', 'localappdata', 'display', 'browser']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())));
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

/** Never feed a prompt to cmd.exe. Native Claude or its known npm entrypoint only. */
export function commandFor(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== 'win32' || !['claude', 'codex'].includes(command)) return { command, args };
  const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const exe = join(dir, `${command}.exe`);
    if (isAbsolute(exe) && existsSync(exe)) return { command: exe, args };
  }
  for (const dir of path.split(delimiter).filter(Boolean)) {
    const entry = command === 'claude' ? join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js') : join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (isAbsolute(entry) && existsSync(entry)) return { command: process.execPath, args: [entry, ...args] };
  }
  throw new ProcessNotStartedError(`${command} was not found. Install its native CLI or npm package, then restart ControlOS.`);
}

/**
 * Setup-catalog tools (git, npm, code, gh, brew, claude) — never user input. On Windows
 * many are `.cmd` shims that Node cannot spawn directly; those run through cmd.exe with
 * only plain arguments, so nothing a shell would interpret can reach it.
 */
export function toolCommand(command: string, args: string[]): { command: string; args: string[]; shell: boolean } {
  if (command === 'claude' || command === 'codex') return { ...commandFor(command, args), shell: false };
  if (process.platform !== 'win32' || /[\\/]/.test(command)) return { command, args, shell: false };
  const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const dirs = path.split(delimiter).filter((dir) => dir && isAbsolute(dir));
  for (const dir of dirs) { const exe = join(dir, `${command}.exe`); if (existsSync(exe)) return { command: exe, args, shell: false }; }
  for (const dir of dirs) {
    const shim = join(dir, `${command}.cmd`);
    if (!existsSync(shim)) continue;
    if (args.some((arg) => !/^[\w@.:=/-]+$/.test(arg))) throw new ProcessNotStartedError(`${command} arguments are not plain; refused`);
    return { command: `"${shim}"`, args, shell: true };
  }
  return { command, args, shell: false };
}

/** Each POSIX child owns a process group; Windows taskkill targets only its PID tree. */
export function supervise(child: ChildProcess, timeoutMs = 15 * 60_000, stopOwned?: () => void): () => void {
  let settled = false;
  let escalation: NodeJS.Timeout | undefined;
  const kill = () => {
    if (settled || !child.pid) return;
    if (stopOwned) { stopOwned(); return; }
    if (process.platform === 'win32') {
      const root = process.env.SystemRoot ?? process.env.SYSTEMROOT;
      if (!root) { child.kill(); return; }
      execFile(join(root, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      escalation ??= setTimeout(() => {
        if (settled || !child.pid) return;
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }, 3000);
      escalation.unref();
    }
  };
  const timer = setTimeout(kill, timeoutMs); timer.unref();
  const done = new Promise<void>((resolve) => {
    const finish = () => {
      settled = true; clearTimeout(timer); clearTimeout(escalation); active.delete(child); resolve();
    };
    child.once('close', finish); child.once('error', () => { if (!child.pid) finish(); });
  });
  active.set(child, { kill, done });
  return kill;
}

export async function stopProcesses(): Promise<void> {
  const pending = [...active.values()];
  for (const process of pending) process.kill();
  await Promise.all(pending.map((p) => p.done));
}
