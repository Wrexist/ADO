import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { spawnOwned, type ProcessIdentity } from './ownedProcess';

describe.skipIf(process.platform !== 'win32')('Windows owned process host', () => {
  it('confirms an empty job without executing when resume is denied', async () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-denied-'));
    const marker = join(root, 'must-not-exist');
    const proc = spawnOwned(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran')`], root, () => false);
    proc.child.stdin.end(); proc.child.stdout.resume(); proc.child.stderr.resume();
    try {
      expect(await proc.done).toBe(-1);
      expect(proc.terminationConfirmed()).toBe(true);
      expect(existsSync(marker)).toBe(false);
    } finally { proc.kill(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });

  it('removes detached descendants before reporting a successful root exit', async () => {
    const leaf = 'setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);';
    const code = `const child=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{detached:true,stdio:'ignore'}); console.log(child.pid); child.unref();`;
    const proc = spawnOwned(process.execPath, ['-e', code], process.cwd());
    proc.child.stdin.end(); proc.child.stderr.resume();
    let output = '';
    proc.child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    try {
      expect(await proc.done).toBe(0);
      expect(proc.terminationConfirmed()).toBe(true);
      const pid = Number(output.trim());
      expect(pid).toBeGreaterThan(0);
      expect(() => process.kill(pid, 0)).toThrow();
    } finally { proc.kill(); }
  });

  it('stops owned descendants when the server process disappears', async () => {
    const leaf = 'console.log(process.pid); setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);';
    const tree = `console.log(process.pid); require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','inherit','inherit']}); setInterval(()=>{},1000); setTimeout(()=>process.exit(),20000);`;
    const code = `
      import { spawnOwned } from ${JSON.stringify(new URL('./ownedProcess.ts', import.meta.url).href)};
      import { createInterface } from 'node:readline';
      const proc = spawnOwned(process.execPath, ['-e', ${JSON.stringify(tree)}], process.cwd());
      proc.child.stdin.end(); proc.child.stderr.pipe(process.stderr);
      let count = 0;
      createInterface({ input: proc.child.stdout }).on('line', line => { console.log(line); if (++count === 2) process.exit(0); });
    `;
    const server = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    server.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    server.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    try {
      const code = await new Promise<number | null>((resolve, reject) => { server.once('close', resolve); server.once('error', reject); });
      expect(code, stderr).toBe(0);
      const pids = stdout.trim().split(/\s+/).map(Number);
      expect(pids).toHaveLength(2);
      await expect.poll(() => pids.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } }), { timeout: 5000 }).toEqual([]);
    } finally { server.kill(); }
  });

  it('records exact identity before executing and preserves quoted arguments and streams', async () => {
    let identity: ProcessIdentity | undefined;
    const args = ['with space', 'quote"here', 'tail\\', '', 'åäö', '$(not-a-shell) & echo no'];
    const proc = spawnOwned(process.execPath, ['-e', 'console.log(JSON.stringify(process.argv.slice(1))); console.error("diagnostic");', ...args], process.cwd(), (value) => { identity = value; });
    proc.child.stdin.end();
    let stdout = ''; let stderr = '';
    proc.child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
    try {
      expect(await proc.done).toBe(0);
      expect(identity).toMatchObject({ version: 1, platform: 'win32' });
      expect(identity?.creationTime).toMatch(/^\d+$/);
      expect(JSON.parse(stdout)).toEqual(args);
      expect(stderr.trim()).toBe('diagnostic');
    } finally { proc.kill(); }
  });

  it('never resumes the suspended agent if durable identity storage fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-suspended-'));
    const marker = join(root, 'must-not-exist');
    const proc = spawnOwned(process.execPath, ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'ran')`], root, () => { throw new Error('identity persistence failed'); });
    const closed = new Promise<void>((resolve) => proc.child.once('close', () => resolve()));
    proc.child.stdin.end(); proc.child.stdout.resume(); proc.child.stderr.resume();
    try {
      await expect(proc.done).rejects.toThrow('identity persistence failed');
      expect(existsSync(marker)).toBe(false);
    } finally { proc.kill(); await closed; rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
  });

  it('confirms termination of two descendant levels that ignore soft stop', async () => {
    const leaf = 'console.log(process.pid); process.on("SIGTERM",()=>{}); setInterval(()=>{},1000);';
    const middle = `console.log(process.pid); require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:['ignore','inherit','inherit']}); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`;
    const root = `console.log(process.pid); require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(middle)}],{stdio:['ignore','inherit','inherit']}); process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);`;
    const proc = spawnOwned(process.execPath, ['-e', root], process.cwd());
    proc.child.stdin.end(); proc.child.stderr.resume();
    const pids: number[] = [];
    const reader = createInterface({ input: proc.child.stdout });
    try {
      for await (const line of reader) {
        pids.push(Number(line));
        if (pids.length === 3) { proc.kill(); break; }
      }
      expect(pids).toHaveLength(3);
      expect(await proc.done).toBe(-1);
      for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow();
    } finally { proc.kill(); reader.close(); }
  });
});
