import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexSpawner } from './codex';
import type { AgentUpdate } from './adapter';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
function fixture(mode: 'success' | 'approval' | 'api' | 'invalid' | 'stop') {
  const cwd = mkdtempSync(join(tmpdir(), 'ado-codex-protocol-')); dirs.push(cwd);
  const file = join(cwd, 'fake.cjs');
  writeFileSync(file, `
const readline = require('node:readline');
const mode = ${JSON.stringify(mode)};
const output = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
const input = readline.createInterface({ input: process.stdin });
input.on('close', () => process.exit(0));
function finish() {
  output({method:'item/completed', params:{threadId:'thread',item:{type:'agentMessage',text:'fixture completed'}}});
  output({method:'thread/tokenUsage/updated', params:{threadId:'thread',tokenUsage:{total:{inputTokens:12,outputTokens:7}}}});
  output({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'completed'}}});
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
    output({id:m.id,result:{turn:{id:'turn'}}});
    output({method:'turn/started',params:{threadId:'thread',turn:{id:'turn'}}});
    if (mode === 'invalid') { process.stdout.write('invalid json\\n'); return; }
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
  return new CodexSpawner(() => ({ command: process.execPath, args: [file] })).spawn({ cwd, prompt: 'fixture only', turnCap: 10 });
}

describe('Codex app-server boundary (offline protocol fixture)', () => {
  it.each(['success', 'approval'] as const)('completes %s with normalized evidence and denies approval', async (mode) => {
    const handle = fixture(mode); const updates: AgentUpdate[] = [];
    for await (const update of handle.updates!) updates.push(update);
    expect(await handle.done).toBe(0);
    expect(updates).toContainEqual({ kind: 'done', ok: true, tokensIn: 12, tokensOut: 7, turns: null, resultText: 'fixture completed' });
    if (mode === 'approval') expect(updates.some((u) => u.kind === 'progress' && u.text.includes('declined'))).toBe(true);
  });
  it.each(['api', 'invalid'] as const)('fails closed for %s', async (mode) => {
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
