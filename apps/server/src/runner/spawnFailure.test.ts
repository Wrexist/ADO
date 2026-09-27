import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { Bus } from '../bus';
import { openDb } from '../db';
import { executionLocks, runs } from '../db/schema';
import { Runner } from './index';
import type { Spawner } from './spawner';

it('keeps a live writer quarantined when its adapter throws before returning a handle, including after reopening', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-lost-spawn-')), first = join(root, 'first'), other = join(root, 'other');
  mkdirSync(first); mkdirSync(other);
  const path = join(root, 'profile.sqlite'), { db, sqlite } = openDb(path);
  let child: ChildProcessWithoutNullStreams | undefined, ready = false;
  let closed = Promise.resolve();
  const starts: string[] = [];
  const spawner: Spawner = { spawn(opts) {
    starts.push(opts.prompt);
    if (starts.length === 1) {
      child = spawn(process.execPath, ['-e', "console.log('ready');setInterval(()=>{},1000);setTimeout(()=>process.exit(),30000)"], { cwd: opts.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      closed = new Promise<void>((resolve) => { child!.once('close', () => resolve()); });
      child.on('error', () => {}); child.stdin.end(); child.stderr.resume();
      child.stdout.on('data', () => { ready = true; });
      // A real process exists, but the runner receives no handle or done promise.
      throw new Error('Adapter lost the process handle');
    }
    return { lines: (async function* () {})(), done: Promise.resolve(0), kill() {} };
  } };
  const cwdFor = (id: string) => id === 'first' ? first : other;
  const runner = new Runner(new Bus(db), db, spawner, { cwdFor, maxConcurrent: 1 });
  let reopened: ReturnType<typeof openDb> | undefined, recovered: Runner | undefined;
  try {
    const failed = runner.dispatch({ repoId: 'first', task: 'lost handle' });
    await expect.poll(() => ready, { timeout: 15000 }).toBe(true);
    expect(db.select().from(runs).where(eq(runs.id, failed.runId)).get()).toMatchObject({ status: 'failed', processTermination: 'unconfirmed' });
    expect(() => process.kill(child!.pid!, 0)).not.toThrow();
    const waiting = runner.dispatch({ repoId: 'first', task: 'must wait' });
    const independent = runner.dispatch({ repoId: 'other', task: 'independent' });
    await expect.poll(() => runner.isLive(independent.runId)).toBe(false);
    expect(starts).toEqual(['lost handle', 'independent']);
    expect(db.select().from(runs).where(eq(runs.id, waiting.runId)).get()?.status).toBe('queued');
    reopened = openDb(path);
    recovered = new Runner(new Bus(reopened.db), reopened.db, spawner, { cwdFor, maxConcurrent: 1 });
    recovered.reconcileOrphans();
    expect(reopened.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(starts).toEqual(['lost handle', 'independent']);
    expect(reopened.db.select().from(runs).where(eq(runs.id, waiting.runId)).get()?.status).toBe('queued');
    // The test owns this live handle. Production recovery must not infer stop
    // from a PID or from the disappearance of the runner's in-memory handle.
    child!.kill(); await closed;
    expect(recovered.reconcileRun(failed.runId)).toBe(false);
    expect(reopened.db.select().from(executionLocks).all()).toHaveLength(1);
  } finally {
    child?.kill(); await closed;
    await recovered?.stop(); await runner.stop(); reopened?.sqlite.close(); sqlite.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 60000);
