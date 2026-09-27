import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexSpawner } from './codex';
import type { AgentUpdate } from './adapter';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
function fixture(mode: 'success' | 'approval' | 'api' | 'invalid' | 'stop' | 'oversized' | 'stderr' | 'canary' | 'provider-error' | 'missing-turn' | 'wrong-turn' | 'missing-thread' | 'unknown-status' | 'early-completion' | 'notification-first' | 'conflicting-start' | 'array-status') {
  const cwd = mkdtempSync(join(tmpdir(), 'ado-codex-protocol-')); dirs.push(cwd);
  const file = join(cwd, 'fake.cjs');
  writeFileSync(file, `
const readline = require('node:readline');
const mode = ${JSON.stringify(mode)};
const output = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const input = readline.createInterface({ input: process.stdin });
input.on('close', () => process.exit(0));
function finish() {
  const text = mode==='canary' ? ('x'.repeat(70)+'canary-private-value').padEnd(3990,'x')+'canary-private-value' : 'fixture completed';
  output({method:'item/completed', params:{threadId:'thread',item:{type:'agentMessage',text}}});
  output({method:'thread/tokenUsage/updated', params:{threadId:'thread',tokenUsage:{total:{inputTokens:12,outputTokens:7}}}});
  output({method:'turn/completed',params:{threadId:mode==='missing-thread'?undefined:'thread',turn:{id:mode==='wrong-turn'?'other-turn':'turn',status:mode==='unknown-status'?'future-canary-private-value':mode==='array-status'?['completed']:'completed'}}});
}
input.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') output({id:m.id,result:{}});
  if (m.method === 'account/read') output({id:m.id,result:{account:{type:mode==='api'?'apiKey':'chatgpt'}}});
  if (m.method === 'thread/start') {
    if (m.params.sandbox !== 'workspace-write' || m.params.approvalPolicy !== 'on-request') process.exit(9);
    output({id:m.id,result:{thread:{id:'thread'}}});
  }
  if (m.method === 'turn/start') {
    if (m.params.sandboxPolicy.networkAccess !== false) process.exit(10);
    if (mode === 'early-completion') { finish(); return; }
    if (mode === 'notification-first') output({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
    output({id:m.id,result:{turn:mode==='missing-turn'?{}:{id:'turn'}}});
    output({method:'turn/started',params:{threadId:'thread',turn:{id:mode==='conflicting-start'?'other-turn':'turn'}}});
    if (mode === 'invalid') { process.stdout.write('invalid json\\n'); return; }
    if (mode === 'provider-error') { output({id:3,error:{message:'provider canary-private-value'}}); return; }
    if (mode === 'oversized') { process.stdout.write('x'.repeat(5*1024*1024)); return; }
    if (mode === 'stderr') for(let i=0;i<10000;i++) process.stderr.write('canary-private-value '+ 'x'.repeat(100)+'\\n');
    if (mode === 'stop') return;
    if (mode === 'approval') output({id:0,method:'item/commandExecution/requestApproval',params:{}});
    else finish();
  }
  // Server request IDs may equal the client's initialization ID.
  if (!m.method && m.id === 0 && mode === 'approval') {
    if (m.result?.decision !== 'decline') process.exit(11);
    finish();
  }
  if (m.method === 'turn/interrupt') {
    output({id:m.id,result:{}});
    output({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'interrupted'}}});
  }
});
`);
  return new CodexSpawner(() => ({ command: process.execPath, args: [file] })).spawn({ cwd, prompt: 'fixture only', turnCap: 10, secrets: ['canary-private-value'] });
}

describe('Codex app-server boundary (offline protocol fixture)', () => {
  it.each(['missing-turn', 'wrong-turn', 'missing-thread', 'unknown-status', 'early-completion', 'conflicting-start', 'array-status'] as const)('rejects incompatible lifecycle %s without success or raw payload', async (mode) => {
    const handle = fixture(mode); const updates: AgentUpdate[] = [];
    for await (const update of handle.updates!) updates.push(update);
    expect(await handle.done).not.toBe(0);
    expect(updates.some((u) => u.kind === 'done' && u.ok)).toBe(false);
    expect(handle.diagnostics!()).toContain('incompatible');
    expect(JSON.stringify({ updates, diagnostics: handle.diagnostics!() })).not.toContain('canary-private-value');
  });
  it.each(['canary', 'provider-error'] as const)('redacts %s before publishing or shortening provider text', async (mode) => {
    const handle = fixture(mode); const updates: AgentUpdate[] = [];
    for await (const update of handle.updates!) updates.push(update);
    const code = await handle.done;
    expect(code === 0).toBe(mode === 'canary');
    const exposed = JSON.stringify({ updates, diagnostics: handle.diagnostics!() });
    expect(exposed).not.toContain('canary-private');
    expect(exposed).toContain('[redacted]');
  });
  it.each(['success', 'approval', 'stderr', 'notification-first'] as const)('completes %s with normalized evidence and denies approval', async (mode) => {
    const handle = fixture(mode); const updates: AgentUpdate[] = [];
    for await (const update of handle.updates!) updates.push(update);
    expect(await handle.done).toBe(0);
    expect(updates).toContainEqual({ kind: 'done', ok: true, tokensIn: 12, tokensOut: 7, turns: null, resultText: 'fixture completed' });
    if (mode === 'approval') expect(updates.some((u) => u.kind === 'progress' && u.text.includes('declined'))).toBe(true);
    if (mode === 'stderr') {
      expect(handle.diagnostics!()).toContain('diagnostics truncated');
      expect(handle.diagnostics!()).not.toContain('canary-private-value');
      expect(handle.diagnostics!().length).toBeLessThan(4000);
    }
  });
  it.each(['api', 'invalid', 'oversized'] as const)('fails closed for %s', async (mode) => {
    const handle = fixture(mode); const updates: AgentUpdate[] = [];
    for await (const update of handle.updates!) updates.push(update);
    expect(await handle.done).not.toBe(0);
    expect(updates.some((u) => u.kind === 'done' && u.ok)).toBe(false);
    expect(handle.diagnostics!()).not.toBe('');
  });
  it('interrupts its turn and never reports stopped work as successful', async () => {
    const handle = fixture('stop'); const updates: AgentUpdate[] = [];
    for await (const update of handle.updates!) { updates.push(update); if (update.kind === 'started') handle.kill(); }
    expect(await handle.done).not.toBe(0);
    expect(updates).toContainEqual(expect.objectContaining({ kind: 'done', ok: false }));
  });
});
