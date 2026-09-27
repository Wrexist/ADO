import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processEnv, supervise } from './processControl';

export interface ProcessIdentity {
  version: 2;
  platform: 'win32';
  id: string;
  jobName: string;
  pid: number;
  /** Exact Windows FILETIME, never rounded through a JavaScript number. */
  creationTime: string;
  receiptKey?: string;
}

export interface OwnedProcess {
  child: ChildProcessWithoutNullStreams;
  done: Promise<number>;
  kill: () => void;
  terminationConfirmed: () => boolean;
}

/** Windows launches suspended inside a Job Object, before the identity callback.
 * Successful completion means the native host observed zero active job members.
 * Other platforms retain the existing trusted-local process-group adapter.
 */
export function spawnOwned(command: string, args: string[], cwd: string, onIdentity?: (identity: ProcessIdentity) => boolean | void, receiptRoot?: string): OwnedProcess {
  if (process.platform !== 'win32') {
    const child = spawn(command, args, { cwd, env: processEnv(), detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const kill = supervise(child);
    const done = new Promise<number>((resolve, reject) => {
      child.once('close', (code) => resolve(code ?? -1));
      child.once('error', (error) => { if (child.pid) reject(error); else resolve(-1); });
    });
    void done.catch(() => {});
    return { child, done, kill, terminationConfirmed: () => false };
  }
  if (!isAbsolute(command)) throw new Error('Windows owned processes require an absolute executable path');
  const id = randomUUID();
  let receiptPath: string | undefined;
  const receiptKey = receiptRoot ? randomBytes(32).toString('hex') : undefined;
  if (receiptRoot) {
    mkdirSync(receiptRoot, { recursive: true, mode: 0o700 });
    receiptPath = join(realpathSync(receiptRoot), `${id}.json`);
  }
  const pipeName = `controlos-${id}`;
  const host = process.env.ACC_PROCESS_HOST ?? fileURLToPath(new URL('../../native/dist/ControlOS.JobHost.exe', import.meta.url));
  if (!isAbsolute(host)) throw new Error('Windows process host path must be absolute');
  let socket: Socket | undefined;
  let prepared = false;
  let acknowledged = false;
  let report: number | undefined;
  let closed = false;
  let pipeEnded = false;
  let stopping = false;
  let settled = false;
  let confirmed = false;
  let resolveDone!: (code: number) => void;
  let rejectDone!: (error: Error) => void;
  let closeTimer: NodeJS.Timeout | undefined;
  const done = new Promise<number>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  void done.catch(() => {});
  const server = createServer();
  // libuv otherwise kills the host with its owner before it can flush a receipt.
  // The host's control-pipe watchdog owns shutdown; keep our handle referenced.
  const child = spawn(host, [pipeName, id, command, ...args], { cwd, env: processEnv(), windowsHide: true, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const cleanup = () => { clearTimeout(startupTimer); clearTimeout(closeTimer); socket?.destroy(); server.close(); };
  const fail = (reason: string) => {
    if (settled) return;
    settled = true;
    // This ChildProcess owns a live OS handle. Never look up or kill a recovered PID.
    try { child.kill(); } catch { /* retain the unconfirmed outcome */ }
    cleanup();
    rejectDone(new Error(`Process termination unconfirmed: ${reason}`));
  };
  const finish = () => {
    if (settled || !closed) return;
    if (report !== undefined) { settled = true; confirmed = true; cleanup(); resolveDone(report); }
    else if (pipeEnded) fail('native host closed without an empty-job confirmation');
  };
  const startupTimer = setTimeout(() => fail('native launch handshake timed out'), 15000);
  startupTimer.unref();
  server.on('error', (error) => fail(error.message));
  server.on('connection', (connection) => {
    if (socket || settled) { connection.destroy(); return; }
    socket = connection;
    // Configure the receipt before a process can be created, so an owner crash
    // between identity commit and resume still leaves the host able to attest stop.
    connection.write(JSON.stringify({ receiptPath, receiptKey }) + '\n');
    let pending = '';
    connection.setEncoding('utf8');
    connection.on('error', (error) => fail(error.message));
    connection.on('end', () => { pipeEnded = true; finish(); });
    connection.on('data', (data: string) => {
      pending += data;
      if (pending.length > 8192) { fail('oversized native protocol frame'); return; }
      let end: number;
      while ((end = pending.indexOf('\n')) >= 0 && !settled) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1);
        try {
          const message = JSON.parse(line) as Record<string, unknown>;
          if (message.version !== 2 || message.id !== id) throw new Error('native protocol identity mismatch');
          if (message.type === 'prepared' && !prepared) {
            if (message.jobName !== `Local\\ControlOS.${id}` || !Number.isSafeInteger(message.pid) || Number(message.pid) <= 0 || typeof message.creationTime !== 'string' || !/^\d+$/.test(message.creationTime)) throw new Error('invalid process identity');
            prepared = true;
            const identity: ProcessIdentity = { version: 2, platform: 'win32', id, jobName: message.jobName as string, pid: Number(message.pid), creationTime: message.creationTime, receiptKey };
            // Synchronous durable write must succeed BEFORE execution is authorized.
            let allowed: boolean | void;
            try { allowed = onIdentity?.(identity); }
            catch { throw new Error('identity persistence failed'); }
            if (allowed === false) requestStop();
            clearTimeout(startupTimer);
            connection.write(JSON.stringify({ action: stopping ? 'cancel' : 'resume' }) + '\n');
            acknowledged = true;
          } else if (message.type === 'empty' && prepared && report === undefined && message.activeProcesses === 0 && Number.isInteger(message.exitCode)) {
            report = Number(message.exitCode); finish();
          } else throw new Error('unexpected native protocol message');
        } catch (error) { fail((error as Error).message); }
      }
    });
  });
  server.listen(`\\\\.\\pipe\\${pipeName}`);
  const requestStop = () => {
    if (settled || stopping) return;
    stopping = true;
    if (acknowledged && socket && !socket.destroyed) socket.write('cancel\n');
    closeTimer ??= setTimeout(() => fail('job stop deadline expired'), 15000);
    closeTimer.unref();
  };
  const kill = supervise(child, 15 * 60_000, requestStop);
  child.once('error', (error) => {
    if (!child.pid) {
      settled = true; cleanup(); resolveDone(-1);
    } else fail(error.message);
  });
  child.once('close', () => {
    closed = true;
    closeTimer ??= setTimeout(() => fail('native completion channel missing'), 1000);
    closeTimer.unref();
    if (!socket) pipeEnded = true;
    finish();
  });
  return { child, done, kill, terminationConfirmed: () => confirmed };
}
