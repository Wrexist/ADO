/**
 * Spawn a command, merge stdout+stderr into ONE line stream, and always terminate that stream
 * when the process ends — on `close` OR `error`. The error case matters: a missing binary
 * (ENOENT) fires `error` and may never emit stream `end`, so a naive "end when both streams
 * end" merge hangs the reader forever. Ending on close/error guarantees the `for await` completes.
 *
 * Minimal env allow-list (never the dashboard's secrets); HOME lets a spawned `claude` use its
 * own login, DISPLAY/BROWSER let `claude auth login` open a browser on a Linux desktop.
 */
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';

export interface MergedProc {
  lines: AsyncIterable<string>;
  done: Promise<number>; // exit code, or -1 if it errored / was killed
  kill: () => void;
}

function minimalEnv(): NodeJS.ProcessEnv {
  const { PATH, HOME, USER, LANG, TERM, TMPDIR, DISPLAY, BROWSER } = process.env;
  return { PATH, HOME, USER, LANG, TERM, TMPDIR, DISPLAY, BROWSER };
}

export function spawnMerged(cmd: string, args: string[], cwd?: string): MergedProc {
  const child = spawn(cmd, args, { cwd, env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const merged = new PassThrough();
  child.stdout.pipe(merged, { end: false });
  child.stderr.pipe(merged, { end: false });
  let ended = false;
  const endStream = () => {
    if (!ended) {
      ended = true;
      merged.end();
    }
  };
  child.on('close', endStream);
  child.on('error', endStream); // ENOENT/EACCES — end the stream so the reader can't hang
  const rl = createInterface({ input: merged, crlfDelay: Infinity });
  const done = new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? -1));
    child.on('error', () => resolve(-1));
  });
  return { lines: rl, done, kill: () => child.kill('SIGTERM') };
}
