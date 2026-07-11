/**
 * Intent parser. The heuristic parser needs no key and handles the common phrasings —
 * it's the default so the command box works offline. When an Anthropic key is connected
 * (Settings), a Claude-backed parser can drop in behind the same interface for fuzzier
 * language; both return the same typed Intent (parsedBy records which ran — honest).
 */
import type { Intent, IntentType } from '@ado/shared';

export interface IntentParser {
  parse(text: string, knownRepoIds: string[]): Intent;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Find a repo the text refers to: "in/for/on/to <id>", or any known id/name mentioned. */
function findRepo(text: string, ids: string[]): string | undefined {
  const lower = text.toLowerCase();
  const inMatch = /\b(?:in|for|on|to)\s+([a-z0-9][a-z0-9 _-]*)/i.exec(text);
  if (inMatch) {
    const cand = inMatch[1].trim().toLowerCase().replace(/\s+/g, '-');
    const hit = ids.find((id) => cand.startsWith(id) || id.startsWith(cand));
    if (hit) return hit;
  }
  return ids.find((id) => lower.includes(id) || lower.includes(id.replace(/-/g, ' ')));
}

/** Recover the task text: strip the "task" keyword, the repo reference, and lead verbs. */
function extractTask(text: string, repoId?: string): string {
  let s = text.replace(/^\s*(please\s+)?/i, '');
  s = s.replace(/\b(add|create|new)\s+(a\s+)?task\b/i, '');
  s = s.replace(/\btodo\b/i, '');
  if (repoId) {
    for (const nv of [repoId, repoId.replace(/-/g, ' ')]) {
      s = s.replace(new RegExp(`\\b(?:in|for|on|to)\\s+${escapeRegex(nv)}\\b`, 'i'), '');
      s = s.replace(new RegExp(`\\b${escapeRegex(nv)}\\b`, 'i'), '');
    }
  }
  s = s.replace(/^\s*[:,\-–]+\s*/, ''); // leading connector punctuation
  s = s.replace(/^(dispatch|run|start|kick off|fix|build|implement|refactor|optimize|write|generate|make|do)\s+/i, '');
  s = s.replace(/^\s*[:,\-–]+\s*/, '');
  return s.trim();
}

export class HeuristicParser implements IntentParser {
  parse(text: string, knownRepoIds: string[]): Intent {
    const t = text.trim();
    const lower = t.toLowerCase();
    const repoId = findRepo(t, knownRepoIds);
    const base = { confidence: 0.9, parsedBy: 'heuristic' as const, raw: t };

    const is = (...words: string[]) => words.some((w) => lower.includes(w));

    // order matters: most specific first
    if (is('add task', 'create task', 'new task', 'todo', 'to-do', 'remind me')) {
      return { ...base, type: 'create_task', repoId, task: extractTask(t, repoId) };
    }
    if (is('gate', 'verify', 'gate status', 'is it green', 'passing')) {
      return { ...base, type: 'run_gate', repoId, confidence: 0.85 };
    }
    if (is('summar', 'recent activity', 'what happened', "what's new", 'whats new', 'latest')) {
      return { ...base, type: 'summarize_activity' };
    }
    if (is('status', 'overview', 'how are', "how's", 'hows', 'health', 'everything ok')) {
      return { ...base, type: 'status_query' };
    }
    if (is('dispatch', 'run agent', 'fix', 'build', 'implement', 'refactor', 'optimize', 'add ', 'write tests', 'generate')) {
      // a dispatch needs both a repo and a task to be actionable
      const task = extractTask(t, repoId);
      return {
        ...base,
        type: 'dispatch_task',
        repoId,
        task: task || t,
        confidence: repoId && task ? 0.8 : 0.5,
      };
    }
    return { ...base, type: 'unknown' as IntentType, confidence: 0.3 };
  }
}
