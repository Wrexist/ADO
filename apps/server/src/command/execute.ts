/**
 * Intent execution. Read intents compute an answer from stored state (never a model
 * making up numbers). Mutating intents (create_task, dispatch_task) are split into a
 * PREVIEW (what confirming will do) and the actual effect, which only runs on an
 * explicit confirm call.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { intentKind, type CommandResponse, type Intent } from '@ado/shared';
import type { Bus } from '../bus';
import type { Runner } from '../runner';

interface Deps {
  bus: Bus;
  runner: Runner;
  cwdFor: (repoId: string) => string | null;
}

/** Deterministic status/summary text from the bus — the no-fabrication rule applies. */
function statusText(bus: Bus): string {
  const s = bus.snapshot().state;
  const repos = Object.keys(s.repos).length;
  const running = Object.values(s.agents).filter((a) => a.kind === 'runner' && a.status === 'running').length;
  const builds = Object.values(s.builds).filter((b) => b.state === 'running').length;
  const deploys = s.deployments.length;
  return `${repos} repositories · ${running} agent${running === 1 ? '' : 's'} running · ${builds} build${builds === 1 ? '' : 's'} in progress · ${deploys} deployment${deploys === 1 ? '' : 's'} recorded.`;
}

function summaryText(bus: Bus): string {
  const items = bus.snapshot().state.activity.slice(0, 5);
  if (items.length === 0) return 'No activity recorded yet.';
  return items.map((a) => `• ${a.title}: ${a.detail}`).join('\n');
}

function gateText(cwd: string | null, repoId: string | undefined): string {
  if (!repoId) return 'Which repo? Try "gate status of <repo>".';
  if (!cwd) return `Repo "${repoId}" isn’t in the scanned set.`;
  try {
    const yaml = readFileSync(join(cwd, '.claude/ops.yml'), 'utf8');
    const gates = [...yaml.matchAll(/name:\s*([\w.-]+)[\s\S]*?status:\s*(\w+)/g)].map((m) => `${m[1]} → ${m[2]}`);
    return gates.length ? `Gates in ${repoId}:\n${gates.map((g) => `• ${g}`).join('\n')}` : `No gates found in ${repoId}/.claude/ops.yml.`;
  } catch {
    return `No .claude/ops.yml in ${repoId}.`;
  }
}

/** Parse → respond. Read intents execute now; mutate intents return a preview to confirm. */
export function respond(intent: Intent, deps: Deps): CommandResponse {
  const kind = intentKind(intent.type);

  switch (intent.type) {
    case 'status_query':
      return { intent, kind, message: statusText(deps.bus), confirm: null };
    case 'summarize_activity':
      return { intent, kind, message: summaryText(deps.bus), confirm: null };
    case 'run_gate':
      return { intent, kind, message: gateText(deps.cwdFor(intent.repoId ?? ''), intent.repoId), confirm: null };

    case 'create_task':
      if (!intent.repoId || !intent.task) {
        return { intent, kind: 'unknown', message: 'Which repo and what task? Try "add task to <repo>: <task>".', confirm: null };
      }
      return { intent, kind, message: `Add “${intent.task}” to ${intent.repoId}/TASK.md?`, confirm: intent };

    case 'dispatch_task':
      if (!intent.repoId || !intent.task) {
        return { intent, kind: 'unknown', message: 'Which repo and what should the agent do? Try "fix the flaky test in <repo>".', confirm: null };
      }
      if (!deps.cwdFor(intent.repoId)) {
        return { intent, kind: 'unknown', message: `Repo "${intent.repoId}" isn’t in the scanned set, so it can’t be dispatched.`, confirm: null };
      }
      return { intent, kind, message: `Dispatch an agent to ${intent.repoId}: “${intent.task}”?`, confirm: intent };

    default:
      return {
        intent,
        kind: 'unknown',
        message: 'Try: "status", "summarize recent activity", "gate status of <repo>", "add task to <repo>: …", or "fix <thing> in <repo>".',
        confirm: null,
      };
  }
}

/** Execute a confirmed mutating intent. Returns a human-readable result. */
export function execute(intent: Intent, deps: Deps): { ok: boolean; message: string } {
  if (intent.type === 'create_task') {
    if (!intent.repoId || !intent.task) return { ok: false, message: 'Missing repo or task.' };
    const cwd = deps.cwdFor(intent.repoId);
    if (!cwd) return { ok: false, message: `Repo "${intent.repoId}" isn’t scanned.` };
    try {
      appendFileSync(join(cwd, 'TASK.md'), `\n- [ ] ${intent.task}\n`);
      return { ok: true, message: `Added to ${intent.repoId}/TASK.md: ${intent.task}` };
    } catch (e) {
      return { ok: false, message: `Couldn’t write TASK.md: ${(e as Error).message}` };
    }
  }

  if (intent.type === 'dispatch_task') {
    if (!intent.repoId || !intent.task) return { ok: false, message: 'Missing repo or task.' };
    try {
      const { runId } = deps.runner.dispatch({ repoId: intent.repoId, task: intent.task });
      return { ok: true, message: `Dispatched agent ${runId} to ${intent.repoId}.` };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  return { ok: false, message: 'Not a confirmable intent.' };
}
