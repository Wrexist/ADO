import { execFile, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join, isAbsolute } from 'node:path';

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
  throw new Error(`${command} was not found. Install its native CLI or npm package, then restart ControlOS.`);
}

/** Each POSIX child owns a process group; Windows taskkill targets only its PID tree. */
export function supervise(child: ChildProcess, timeoutMs = 15 * 60_000): () => void {
  let settled = false;
  let escalation: NodeJS.Timeout | undefined;
  const kill = () => {
    if (settled || !child.pid) return;
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
    child.once('close', finish); child.once('error', finish);
  });
  active.set(child, { kill, done });
  return kill;
}

export async function stopProcesses(): Promise<void> {
  const pending = [...active.values()];
  for (const process of pending) process.kill();
  await Promise.all(pending.map((p) => p.done));
}
