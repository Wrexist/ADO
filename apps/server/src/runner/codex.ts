/** Codex app-server adapter. Contract baseline: locally generated CLI 0.157.0 schema.
 * Uses existing ChatGPT login only; API billing and approval escalation are not enabled.
 * https://learn.chatgpt.com/docs/app-server
 */
import { boundedDiagnostics, boundedLines } from '../lib/processOutput';
import { redact } from '../lib/redact';
import { commandFor } from '../lib/processControl';
import { spawnOwned } from '../lib/ownedProcess';
import type { AgentUpdate } from './adapter';
import type { Spawner, SpawnOpts, SpawnHandle } from './spawner';

export const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function codexUpdate(method: string, params: Record<string, unknown>, secrets: Array<string | undefined> = []): AgentUpdate[] {
  const item = object(params.item);
  if (method === 'turn/started') return [{ kind: 'started' }];
  if (method === 'item/started' && ['commandExecution', 'fileChange', 'mcpToolCall'].includes(String(item.type))) return [{ kind: 'tool', name: String(item.type) }];
  if (method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') return [{ kind: 'progress', text: redact(item.text, secrets).slice(0, 80) }];
  return [];
}

export class CodexSpawner implements Spawner {
  constructor(private readonly executable = () => commandFor('codex', ['app-server'])) {}
  spawn(opts: SpawnOpts): SpawnHandle {
    const executable = this.executable();
    const owned = spawnOwned(executable.command, executable.args, opts.cwd, opts.onProcessIdentity, opts.receiptRoot);
    const { child } = owned;
    const forceKill = owned.kill;
    const stderr = boundedDiagnostics(child.stderr, opts.secrets);
    let failure = '';
    const reader = boundedLines(child.stdout, forceKill);
    let threadId: string | undefined; let turnId: string | undefined; let stopped = false; let completed = false;
    let shutdownTimer: NodeJS.Timeout | undefined;
    const send = (message: unknown) => { if (!child.stdin.destroyed) child.stdin.write(JSON.stringify(message) + '\n'); };
    child.stdin.on('error', () => {});
    const shutdown = () => {
      child.stdin.end(); shutdownTimer ??= setTimeout(forceKill, 3000); shutdownTimer.unref();
    };
    const done = owned.done.then((code) => completed && !stopped ? code : -1).finally(() => clearTimeout(shutdownTimer));
    void done.catch(() => {});
    child.once('error', () => { failure = 'Codex process could not be started'; });
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
          let decoded: unknown;
          try { decoded = JSON.parse(line); } catch { throw new Error('Codex returned invalid protocol JSON'); }
          const message = object(decoded); const result = object(message.result); const params = object(message.params);
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
            const id = object(result.turn).id;
            if (!threadId || typeof id !== 'string' || !id || (turnId && turnId !== id)) throw new Error('Codex turn response is incompatible');
            turnId = id;
          } else if (message.id !== undefined && typeof message.method === 'string') {
            // Fail closed. No provider request can silently grant session-wide permissions.
            if (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval') send({ id: message.id, result: { decision: 'decline' } });
            else if (message.method === 'item/permissions/requestApproval') send({ id: message.id, result: { permissions: {}, scope: 'turn' } });
            else if (message.method === 'mcpServer/elicitation/request') send({ id: message.id, result: { action: 'decline', content: null } });
            else { send({ id: message.id, error: { code: -32601, message: 'Interactive request is not supported by this adapter' } }); kill(); }
            yield { kind: 'progress', text: 'Permission escalation declined; current adapter keeps its original scope.' };
          } else if (typeof message.method === 'string') {
            // Lifecycle notifications are required evidence, not optional telemetry.
            // Never finish a different turn or infer success from an unbound frame.
            if (message.method === 'turn/started' || message.method === 'turn/completed') {
              const turn = object(params.turn);
              if (!threadId || params.threadId !== threadId || typeof turn.id !== 'string' || !turn.id || (turnId && turn.id !== turnId)) throw new Error('Codex turn lifecycle identity is incompatible');
              if (message.method === 'turn/completed' && (!turnId || typeof turn.status !== 'string' || !['completed', 'failed', 'interrupted'].includes(turn.status))) throw new Error('Codex turn completion is incompatible');
            }
            if (params.threadId && params.threadId !== threadId) continue;
            const item = object(params.item);
            if (message.method === 'turn/started') { const id = object(params.turn).id; if (typeof id === 'string') turnId = id; }
            if (message.method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string') resultText = redact(item.text, opts.secrets).slice(0, 4000);
            if (message.method === 'thread/tokenUsage/updated') { const usage = object(object(params.tokenUsage).total); tokensIn = count(usage.inputTokens); tokensOut = count(usage.outputTokens); }
            for (const update of codexUpdate(message.method, params, opts.secrets)) { if (update.kind === 'tool' && ++tools > opts.turnCap) kill(); yield update; }
            if (message.method === 'turn/completed') {
              completed = true;
              yield { kind: 'done', ok: object(params.turn).status === 'completed' && !stopped, tokensIn, tokensOut, turns: null, resultText };
              shutdown(); break;
            }
          }
        }
      } catch (error) {
        failure = redact((error as Error).message, opts.secrets).slice(0, 3500); forceKill();
        yield { kind: 'done', ok: false, tokensIn, tokensOut, turns: null, resultText: null };
      } finally { if (!completed) forceKill(); }
    }
    return { lines: (async function* () {})(), updates: updates(), done, kill, diagnostics: () => [failure.slice(0, 350), stderr()].filter(Boolean).join('\n'), terminationConfirmed: owned.terminationConfirmed };
  }
}
