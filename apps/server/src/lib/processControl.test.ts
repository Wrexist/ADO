import { spawn } from 'node:child_process';
import { expect, it } from 'vitest';
import { processEnv, supervise } from './processControl';
it('does not inherit dashboard secrets into child environments', () => {
  process.env.ACC_TOKEN = 'test-private-key';
  try { expect(processEnv().ACC_TOKEN).toBeUndefined(); }
  finally { delete process.env.ACC_TOKEN; }
});
it('stops an owned process and its child on this host', async () => {
  const childCode = 'setInterval(()=>{},1000)';
  const parentCode = `const {spawn}=require('node:child_process'); const c=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'}); console.log(c.pid); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['-e', parentCode], { detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const kill = supervise(child, 10000);
  let descendant: number | undefined;
  try {
    descendant = await new Promise<number>((resolve, reject) => { child.stdout.once('data', (data: Buffer) => resolve(Number(data.toString().trim()))); child.once('error', reject); });
    kill(); await closed;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(() => process.kill(descendant!, 0)).toThrow();
  } finally {
    kill();
    if (descendant) { try { process.kill(descendant); } catch { /* already stopped */ } }
  }
}, 20000);

it('resolves Windows .cmd tool shims through cmd.exe with plain arguments only', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { toolCommand } = await import('./processControl');
  if (process.platform !== 'win32') { expect(toolCommand('npm', ['-v'])).toEqual({ command: 'npm', args: ['-v'], shell: false }); return; }
  const dir = mkdtempSync(join(tmpdir(), 'controlos-shim-'));
  const previous = process.env.PATH;
  try {
    writeFileSync(join(dir, 'fixturetool.cmd'), '@echo off\r\necho %*\r\n');
    process.env.PATH = `${dir};${previous}`;
    expect(toolCommand('fixturetool', ['install', '-g', '@scope/pkg'])).toEqual({ command: `"${join(dir, 'fixturetool.cmd')}"`, args: ['install', '-g', '@scope/pkg'], shell: true });
    expect(() => toolCommand('fixturetool', ['x & calc'])).toThrow('not plain');
    expect(toolCommand('missing-tool-xyz', ['--version'])).toEqual({ command: 'missing-tool-xyz', args: ['--version'], shell: false });
    const { exec } = await import('../setup/probe');
    const result = await exec('fixturetool', ['hello'], 10000);
    expect(result).toMatchObject({ failed: false, code: 0 });
    expect(result.out.trim()).toBe('hello');
  } finally { process.env.PATH = previous; rmSync(dir, { recursive: true, force: true }); }
});
