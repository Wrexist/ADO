import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { executionLocks, runs } from '../db/schema';
import { spawnOwned, type ProcessIdentity } from '../lib/ownedProcess';
import { readTerminationReceipt } from '../lib/terminationReceipt';
import { Runner } from './index';

describe.skipIf(process.platform !== 'win32')('durable native stop recovery', () => {
  it('T16: keeps a crashed native owner quarantined until its receipt is available, then admits exactly one new owner', async () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-owner-crash-'));
    const database = join(root, 'profile.sqlite');
    const receipts = join(root, 'process-receipts');
    const marker = join(root, 'pids.txt');
    const hostMarker = join(root, 'host-pid.txt');
    const nextMarker = join(root, 'next-start.txt');
    const leaf = `require('node:fs').appendFileSync(${JSON.stringify(marker)},process.pid+'\\n'); setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);`;
    const agent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'}); ${leaf}`;
    const code = `
      import { openDb } from ${JSON.stringify(new URL('../db/index.ts', import.meta.url).href)};
      import { Bus } from ${JSON.stringify(new URL('../bus.ts', import.meta.url).href)};
      import { Runner } from ${JSON.stringify(new URL('./index.ts', import.meta.url).href)};
      import { spawnOwned } from ${JSON.stringify(new URL('../lib/ownedProcess.ts', import.meta.url).href)};
      import { createInterface } from 'node:readline';
      import { existsSync, readFileSync, writeFileSync } from 'node:fs';
      const { db } = openDb(${JSON.stringify(database)});
      const spawner = { spawn(opts) {
        const proc = spawnOwned(process.execPath, ['-e', ${JSON.stringify(agent)}], opts.cwd, opts.onProcessIdentity, opts.receiptRoot);
        writeFileSync(${JSON.stringify(hostMarker)}, String(proc.child.pid));
        proc.child.stdin.end(); proc.child.stderr.resume();
        return { lines: createInterface({input:proc.child.stdout}), done:proc.done, kill:proc.kill, terminationConfirmed:proc.terminationConfirmed };
      }};
      const runner = new Runner(new Bus(db), db, spawner, { cwdFor:()=>${JSON.stringify(root)}, receiptRoot:${JSON.stringify(receipts)} });
      runner.dispatch({repoId:'a',task:'interrupted'});
      runner.dispatch({repoId:'a',task:'previously accepted next job'});
      setInterval(()=>{
        if(existsSync(${JSON.stringify(marker)}) && readFileSync(${JSON.stringify(marker)},'utf8').trim().split(/\\s+/).length===2) process.exit(73);
      },20);
    `;
    let failure: unknown;
    try {
      const crashed = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
      expect(crashed.status, crashed.stderr).toBe(73);
      const { db, sqlite } = openDb(database);
      const bus = new Bus(db); bus.replayFromDb(() => {});
      const started: string[] = [];
      const owners: string[] = [];
      const runner = new Runner(bus, db, { spawn(opts) {
        started.push(opts.prompt);
        owners.push(db.select().from(executionLocks).all()[0].owner);
        const proc = spawnOwned(process.execPath, ['-e', `require('node:fs').appendFileSync(${JSON.stringify(nextMarker)},'started');`], opts.cwd, opts.onProcessIdentity, opts.receiptRoot);
        proc.child.stdin.end(); proc.child.stdout.resume(); proc.child.stderr.resume();
        return { lines: (async function* () {})(), done: proc.done, kill: proc.kill, terminationConfirmed: proc.terminationConfirmed };
      } }, { cwdFor: () => root, receiptRoot: receipts });
      try {
        const interrupted = db.select().from(runs).all().find((row) => row.task === 'interrupted')!;
        expect(interrupted.status).toBe('running');
        const originalLock = db.select().from(executionLocks).all()[0];
        expect(originalLock.runId).toBe(interrupted.id);
        const identity = JSON.parse(interrupted.processIdentity!) as ProcessIdentity;
        expect(identity).toMatchObject({ version: 2, platform: 'win32' });
        await expect.poll(() => Boolean(readTerminationReceipt(receipts, interrupted.processIdentity)), { timeout: 10000 }).toBe(true);
        // Withhold this actual native receipt to exercise recovery without proof.
        // Even observed PID disappearance must not free the persisted ownership.
        const receiptPath = join(receipts, `${identity.id}.json`), held = join(receipts, `${identity.id}.held`);
        renameSync(receiptPath, held);
        expect(runner.reconcileOrphans()).toBe(2);
        expect(started).toEqual([]);
        expect(db.select().from(executionLocks).all()).toEqual([originalLock]);
        expect(db.select().from(runs).all().find((row) => row.id === interrupted.id)).toMatchObject({ status: 'failed', processTermination: 'unconfirmed', processIdentity: interrupted.processIdentity });
        expect(db.select().from(runs).all().find((row) => row.id !== interrupted.id)?.status).toBe('queued');
        for (const pid of readFileSync(marker, 'utf8').trim().split(/\s+/).map(Number)) expect(() => process.kill(pid, 0)).toThrow();
        expect(runner.reconcileRun(interrupted.id)).toBe(false);
        expect(started).toEqual([]);
        renameSync(held, receiptPath);
        expect(runner.reconcileRun(interrupted.id)).toBe(true);
        await expect.poll(() => db.select().from(runs).all().find((row) => row.task !== 'interrupted')?.status).toBe('done');
        expect(started).toEqual(['previously accepted next job']);
        expect(owners).toHaveLength(1); expect(owners[0]).not.toBe(originalLock.owner);
        expect(readFileSync(nextMarker, 'utf8')).toBe('started');
        expect(db.select().from(runs).all().find((row) => row.id === interrupted.id)).toMatchObject({ status: 'failed', processTermination: 'confirmed' });
        expect(db.select().from(executionLocks).all()).toHaveLength(0);
        expect(runner.reconcileRun(interrupted.id)).toBe(false);
        for (const pid of readFileSync(marker, 'utf8').trim().split(/\s+/).map(Number)) expect(() => process.kill(pid, 0)).toThrow();
        // The receipt confirms agent termination before the supervisor's own
        // finally block exits. Wait for that owner to release its working dir.
        const hostPid = Number(readFileSync(hostMarker, 'utf8'));
        expect(Number.isSafeInteger(hostPid) && hostPid > 0).toBe(true);
        await expect.poll(() => { try { process.kill(hostPid, 0); return true; } catch { return false; } }, { timeout: 10000 }).toBe(false);
      } finally { await runner.stop(); sqlite.close(); }
    } catch (error) { failure = error; }
    try { await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
    catch (cleanup) { throw failure ? new AggregateError([failure, cleanup], 'Crash fixture and cleanup both failed') : cleanup; }
    if (failure) throw failure;
  }, 60000);

  it('does not signal an unrelated live process whose PID appears in a stale identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-stale-pid-'));
    const { db, sqlite } = openDb(':memory:');
    let live: ProcessIdentity | undefined;
    const unrelated = spawnOwned(process.execPath, ['-e', 'console.log("ready"); setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);'], root, (identity) => { live = identity; });
    unrelated.child.stdin.end(); unrelated.child.stdout.resume(); unrelated.child.stderr.resume();
    const runner = new Runner(new Bus(db), db, { spawn() { throw new Error('Recovery must not spawn'); } }, { cwdFor: () => root, receiptRoot: root });
    try {
      await expect.poll(() => Boolean(live)).toBe(true);
      const id = randomUUID();
      const identity = { ...live!, id, jobName: `Local\\ControlOS.${id}`, creationTime: (BigInt(live!.creationTime) - 10000n).toString(), receiptKey: randomBytes(32).toString('hex') };
      db.insert(runs).values({ id: 'old', repoId: 'a', task: 'interrupted', model: 'default', status: 'failed', engineVersion: 1, startedTs: new Date().toISOString(), processIdentity: JSON.stringify(identity), processTermination: 'unconfirmed' }).run();
      db.insert(executionLocks).values({ resource: resolve(root).toLowerCase(), runId: 'old', owner: 'previous-owner', acquiredTs: new Date().toISOString() }).run();
      expect(runner.reconcileRun('old')).toBe(false);
      expect(() => process.kill(live!.pid, 0)).not.toThrow();
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
      const payload = JSON.stringify({ version: 1, id, jobName: identity.jobName, pid: identity.pid, creationTime: identity.creationTime, activeProcesses: 0, exitCode: -1, recordedUtc: new Date().toISOString() });
      writeFileSync(join(root, `${id}.json`), JSON.stringify({ payload, mac: createHmac('sha256', Buffer.from(identity.receiptKey, 'hex')).update(payload).digest('hex') }));
      sqlite.exec("CREATE TRIGGER reject_recovery BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'receipt event failure'); END");
      expect(() => runner.reconcileRun('old')).toThrow('receipt event failure');
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
      expect(db.select().from(runs).all()[0].processTermination).toBe('unconfirmed');
      sqlite.exec('DROP TRIGGER reject_recovery');
      expect(runner.reconcileRun('old')).toBe(true);
      expect(() => process.kill(live!.pid, 0)).not.toThrow();
      expect(unrelated.terminationConfirmed()).toBe(false);
    } finally { unrelated.kill(); await unrelated.done; await runner.stop(); sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });
});
