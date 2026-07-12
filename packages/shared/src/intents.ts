/**
 * Command-center intents (Phase 4). The command box turns natural language into one of
 * these, and the server executes it. Read intents run immediately; mutating intents
 * (dispatch a task, write to TASK.md) return a preview and require explicit confirmation
 * before anything happens (council: nothing acts without a confirm step).
 */
import { z } from 'zod';

export const IntentType = z.enum([
  'status_query', // "how are things?" — read
  'summarize_activity', // "what happened recently?" — read
  'run_gate', // "what's the gate status of X?" — read
  'create_task', // "add a task to X: …" — mutate (writes TASK.md)
  'dispatch_task', // "fix the flaky test in X" — mutate (spawns an agent)
  'unknown',
]);
export type IntentType = z.infer<typeof IntentType>;

export const Intent = z.object({
  type: IntentType,
  repoId: z.string().optional(),
  task: z.string().optional(),
  confidence: z.number().min(0).max(1),
  /** How the intent was derived — honest provenance shown in the UI. */
  parsedBy: z.enum(['heuristic', 'claude']),
  raw: z.string(),
});
export type Intent = z.infer<typeof Intent>;

export const READ_INTENTS: IntentType[] = ['status_query', 'summarize_activity', 'run_gate'];
export const MUTATE_INTENTS: IntentType[] = ['create_task', 'dispatch_task'];

export function intentKind(t: IntentType): 'read' | 'mutate' | 'unknown' {
  if (READ_INTENTS.includes(t)) return 'read';
  if (MUTATE_INTENTS.includes(t)) return 'mutate';
  return 'unknown';
}

/** Server response to a parsed command. */
export const CommandResponse = z.object({
  intent: Intent,
  kind: z.enum(['read', 'mutate', 'unknown']),
  /** Read → the answer; mutate → a preview of what confirming will do; unknown → help. */
  message: z.string(),
  /** Present for mutating intents: echo back for the confirm call. */
  confirm: Intent.nullable(),
});
export type CommandResponse = z.infer<typeof CommandResponse>;
