import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
const entry = process.argv[2];
if (!entry) throw new Error('Pass the installed Codex npm entrypoint path');
const child = spawn(process.execPath, [entry, 'app-server'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
let result = false;
const timer = setTimeout(() => {
  if (process.platform === 'win32') execFile(join(process.env.SystemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else child.kill();
  process.exitCode = 1;
  console.error('Codex capability probe timed out');
}, 30000);
child.stderr.resume();
const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  let message; try { message = JSON.parse(line); } catch { return; }
  if (message.id === 0 && message.result) {
    send({ method: 'initialized', params: {} });
    send({ id: 1, method: 'account/read', params: { refreshToken: false } });
  }
  if (message.id === 1) {
    result = Boolean(message.result);
    console.log(JSON.stringify({ handshake: result, accountType: message.result?.account?.type ?? null, requiresAuth: message.result?.requiresOpenaiAuth ?? null }));
    child.stdin.end();
  }
});
child.on('close', () => { clearTimeout(timer); if (!result) process.exitCode = 1; });
child.on('error', (error) => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'controlos_probe', title: 'ControlOS', version: '0.2.0' } } });
