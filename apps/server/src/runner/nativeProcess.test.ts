import { createInterface } from 'node:readline';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { executionLocks, runs } from '../db/schema';
import { spawnOwned, type OwnedProcess } from '../lib/ownedProcess';
import { Runner } from './index';
import type { Spawner } from './spawner';
import { CodexSpawner } from './codex';

describe.skipIf(process.platform !== 'win32')('native process ownership in the runner', () => {
  it('T20: escalates an ignored Codex interrupt and confirms the entire assigned tree stopped', async () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-native-cancel-'));
    const pidFile = join(root, 'pids.txt');
    const file = join(root, 'stubborn.cjs');
    const leaf = `require('node:fs').appendFileSync(${JSON.stringify(pidFile)},process.pid+'\\n'); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);`;
    const middle = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'}); ${leaf}`;
    writeFileSync(file, `
      const output = value => console.log(JSON.stringify(value));
      const input = require('node:readline').createInterface({input:process.stdin});
      setTimeout(()=>process.exit(),20000);
      input.on('line', line => {
        const message = JSON.parse(line);
        if(message.method==='initialize') output({id:message.id,result:{}});
        if(message.method==='account/read') output({id:message.id,result:{account:{type:'chatgpt'}}});
        if(message.method==='thread/start') output({id:message.id,result:{thread:{id:'thread'}}});
        if(message.method==='turn/start') {
          require('node:fs').appendFileSync(${JSON.stringify(pidFile)},process.pid+'\\n');
          require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(middle)}],{stdio:'ignore'});
          output({id:message.id,result:{turn:{id:'turn'}}});
          output({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
        }
        // Deliberately ignore turn/interrupt: the real adapter must escalate.
      });
    `);
    const { db, sqlite } = openDb(':memory:');
    const runner = new Runner(new Bus(db), db, new CodexSpawner(() => ({ command: process.execPath, args: [file] })), { cwdFor: () => root });
    const pids = () => existsSync(pidFile) ? readFileSync(pidFile, 'utf8').trim().split(/\s+/).map(Number) : [];
    try {
      const { runId } = runner.dispatch({ repoId: 'a', task: 'stubborn fixture', provider: 'codex' });
      await expect.poll(() => pids().length, { timeout: 10000 }).toBe(3);
      const assigned = pids();
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
      const cancelledAt = Date.now();
      runner.kill(runId);
      await expect.poll(() => runner.isLive(runId), { timeout: 10000 }).toBe(false);
      expect(Date.now() - cancelledAt).toBeGreaterThanOrEqual(2500);
      expect(db.select().from(runs).all()[0]).toMatchObject({ status: 'failed', processTermination: 'confirmed', note: 'killed from the dashboard' });
      expect(db.select().from(executionLocks).all()).toHaveLength(0);
      for (const pid of assigned) expect(() => process.kill(pid, 0)).toThrow();
    } finally { await runner.stop(); sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });

  it.each(['cancel', 'host-loss'] as const)('records identity before execution and handles %s without overlapping writers', async (mode) => {
    const { db, sqlite } = openDb(':memory:');
    const children: OwnedProcess[] = [];
    let ready = false;
    const childPids: number[] = [];
    const spawner: Spawner = { spawn(opts) {
      if (children.length) {
        for (const pid of childPids) expect(() => process.kill(pid, 0)).toThrow();
        expect(db.select().from(runs).all()[0].processTermination).toBe('confirmed');
      }
      const leaf = 'console.log(process.pid); process.on("SIGTERM",()=>{}); setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);';
      const middle = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','inherit','inherit']}); ${leaf}`;
      const tree = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(middle)}],{stdio:['ignore','inherit','inherit']}); ${leaf}`;
      const code = children.length ? 'console.log("finished")' : tree;
      const owned = spawnOwned(process.execPath, ['-e', code], opts.cwd, (identity) => {
        opts.onProcessIdentity?.(identity);
        const saved = db.select().from(runs).all().find((row) => row.processIdentity?.includes(identity.id));
        expect(saved?.processTermination).toBe('unconfirmed');
      });
      children.push(owned);
      owned.child.stdin.end(); owned.child.stderr.resume();
      const lines = createInterface({ input: owned.child.stdout });
      if (children.length === 1) lines.on('line', (line) => { childPids.push(Number(line)); ready = childPids.length === 3; });
      return { lines, done: owned.done, kill: owned.kill, terminationConfirmed: owned.terminationConfirmed };
    } };
    const runner = new Runner(new Bus(db), db, spawner, { cwdFor: () => process.cwd() });
    try {
      const first = runner.dispatch({ repoId: 'a', task: 'first' });
      runner.dispatch({ repoId: 'a', task: 'second' });
      await expect.poll(() => ready, { timeout: 10000 }).toBe(true);
      expect(children).toHaveLength(1);
      expect(db.select().from(executionLocks).all()).toHaveLength(1);
      if (mode === 'cancel') runner.kill(first.runId);
      else children[0].child.kill();
      await expect.poll(() => runner.isLive(first.runId), { timeout: 10000 }).toBe(false);
      const firstRow = db.select().from(runs).all()[0];
      expect(firstRow.status).toBe('failed');
      expect(childPids).toHaveLength(3);
      expect(childPids).toContain(JSON.parse(firstRow.processIdentity!).pid);
      expect(JSON.parse(firstRow.processIdentity!)).toMatchObject({ version: 1, platform: 'win32' });
      if (mode === 'cancel') {
        await expect.poll(() => db.select().from(runs).all()[1].status, { timeout: 10000 }).toBe('done');
        expect(firstRow.processTermination).toBe('confirmed');
        expect(children).toHaveLength(2);
        expect(db.select().from(executionLocks).all()).toHaveLength(0);
      } else {
        expect(firstRow.processTermination).toBe('unconfirmed');
        expect(firstRow.note).toContain('writer lock retained');
        expect(children).toHaveLength(1);
        expect(db.select().from(executionLocks).all()).toHaveLength(1);
      }
    } finally { await runner.stop(); sqlite.close(); }
  });
});
