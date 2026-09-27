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
