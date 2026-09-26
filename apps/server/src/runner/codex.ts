/** Codex app-server adapter. Contract baseline: locally generated CLI 0.157.0 schema.
 * Uses existing ChatGPT login only; API billing and approval escalation are not enabled.
 * https://learn.chatgpt.com/docs/app-server
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { commandFor, processEnv, supervise } from '../lib/processControl';
import type { AgentUpdate } from './adapter';
import type { Spawner, SpawnOpts, SpawnHandle } from './spawner';

export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function codexUpdate(method: string, params: Record<string, unknown>): AgentUpdate[] {
  const item = object(params.item);
  if (method === 'turn/started') return [{ kind: 'started' }];
  if (method === 'item/started' && ['commandExecution', 'fileChange', 'mcpToolCall'].includes(String(item.type))) return [{ kind: 'tool', name: String(item.type) }];
  if (method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') return [{ kind: 'progress', text: item.text.slice(0, 80) }];
  return [];
}

export class CodexSpawner implements Spawner {
  constructor(private readonly executable = () => commandFor('codex', ['app-server'])) {}
  spawn(opts: SpawnOpts): SpawnHandle {
    const executable = this.executable();
    const child = spawn(executable.command, executable.args, { cwd: opts.cwd, env: processEnv(), windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const forceKill = supervise(child);
    let diagnostics = ''; child.stderr.on('data', (chunk: Buffer) => { diagnostics = (diagnostics + chunk.toString()).slice(-4000); });
    const reader = createInterface({ input: child.stdout });
    let threadId: string | undefined; let turnId: string | undefined; let stopped = false; let completed = false;
    let shutdownTimer: NodeJS.Timeout | undefined;
    const send = (message: unknown) => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(message) + '\n'); };
    child.stdin.on('error', () => {});
    const shutdown = () => {
      child.stdin.end(); shutdownTimer ??= setTimeout(forceKill, 3000); shutdownTimer.unref();
    };
    const done = new Promise<number>((resolve) => {
      child.once('close', (code) => { clearTimeout(shutdownTimer); resolve(completed && !stopped ? code ?? -1 : -1); });
      child.once('error', (error) => { diagnostics = error.message; reader.close(); resolve(-1); });
    });
    const kill = () => {
      stopped = true;
      if (threadId && turnId) send({ id: 99, method: 'turn/interrupt', params: { threadId, turnId } });
      shutdownTimer ??= setTimeout(forceKill, 3000); shutdownTimer.unref();
      if (!turnId) forceKill();
    };
    async function* updates(): AsyncIterable<AgentUpdate> {
      let resultText: string | null = null; let tokensIn: number | null = null; let tokensOut: number | null = null; let tools = 0;
      send({ id: 0, method: 'initialize', params: { clientInfo: { name: 'controlos', title: 'ControlOS', version: '0.2.0' } } });
      try {
        for await (const line of reader) {
          if (line.length > 4 * 1024 * 1024) throw new Error('Codex protocol frame exceeds the supported limit');
          const message = object(JSON.parse(line)); const result = object(message.result); const params = object(message.params);
          if (message.error) throw new Error(String(object(message.error).message ?? 'Codex request failed'));
          if (message.id === 0 && !message.method) {
            send({ method: 'initialized', params: {} });
            send({ id: 1, method: 'account/read', params: { refreshToken: false } });
          } else if (message.id === 1 && !message.method) {
            if (object(result.account).type !== 'chatgpt') throw new Error('Sign in to Codex with ChatGPT. API billing is not enabled in this adapter.');
            send({ id: 2, method: 'thread/start', params: { cwd: opts.cwd, model: opts.model, modelProvider: 'openai', sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: 'user', ephemeral: true } });
          } else if (message.id === 2 && !message.method) {
            const id = object(result.thread).id;
            if (typeof id !== 'string') throw new Error('Codex thread response is incompatible'); threadId = id;
            if (stopped) { shutdown(); break; }
            send({ id: 3, method: 'turn/start', params: { threadId, input: [{ type: 'text', text: opts.prompt }], sandboxPolicy: { type: 'workspaceWrite', writableRoots: [opts.cwd], networkAccess: false }, approvalPolicy: 'on-request' } });
          } else if (message.id === 3 && !message.method) {
            const id = object(result.turn).id; if (typeof id === 'string') turnId = id;
          } else if (message.id !== undefined && typeof message.method === 'string') {
            // Fail closed. No provider request can silently grant session-wide permissions.
            if (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval') send({ id: message.id, result: { decision: 'decline' } });
            else if (message.method === 'item/permissions/requestApproval') send({ id: message.id, result: { permissions: {}, scope: 'turn' } });
            else if (message.method === 'mcpServer/elicitation/request') send({ id: message.id, result: { action: 'decline', content: null } });
            else { send({ id: message.id, error: { code: -32601, message: 'Interactive request is not supported by this adapter' } }); kill(); }
            yield { kind: 'progress', text: 'Permission escalation declined; current adapter keeps its original scope.' };
          } else if (typeof message.method === 'string') {
            if (params.threadId && params.threadId !== threadId) continue;
            const item = object(params.item);
            if (message.method === 'turn/started') { const id = object(params.turn).id; if (typeof id === 'string') turnId = id; }
            if (message.method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') resultText = item.text.slice(0, 4000);
            if (message.method === 'thread/tokenUsage/updated') { const usage = object(object(params.tokenUsage).total); tokensIn = count(usage.inputTokens); tokensOut = count(usage.outputTokens); }
            for (const update of codexUpdate(message.method, params)) { if (update.kind === 'tool' && ++tools > opts.turnCap) kill(); yield update; }
            if (message.method === 'turn/completed') {
              completed = true;
              yield { kind: 'done', ok: object(params.turn).status === 'completed' && !stopped, tokensIn, tokensOut, turns: null, resultText };
              shutdown(); break;
            }
          }
        }
      } catch (error) {
        diagnostics = (error as Error).message; forceKill();
        yield { kind: 'done', ok: false, tokensIn, tokensOut, turns: null, resultText: null };
      } finally { if (!completed) forceKill(); }
    }
    return { lines: (async function* () {})(), updates: updates(), done, kill, diagnostics: () => diagnostics };
  }
}
