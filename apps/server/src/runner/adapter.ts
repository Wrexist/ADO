/**
 * Versioned adapter for `claude -p --output-format stream-json` (council B5).
 *
 * This is an UNSTABLE external interface — its shape changes between Claude Code
 * releases. So parsing is defensive and centralized here: a line we recognize becomes
 * a normalized AgentUpdate; unknown optional event types become `{ kind: 'opaque' }`,
 * which the runner renders as "running (opaque)" with no guessed percentage. The agent
 * never invents progress. Incompatible required result fields stop the run.
 */

import { redact } from '../lib/redact';

export type AgentUpdate =
  | { kind: 'started' }
  | { kind: 'tool'; name: string }
  | { kind: 'progress'; text: string }
  | { kind: 'done'; ok: boolean; tokensIn: number | null; tokensOut: number | null; turns: number | null; resultText: string | null }
  | { kind: 'opaque' };

/** Cap on the captured final text — enough for outcome markers + a summary, never unbounded. */
const RESULT_TEXT_CAP = 4000;

interface Line {
  type?: unknown;
  subtype?: unknown;
  message?: { content?: Array<{ type?: string; name?: string; text?: string }> };
  usage?: { input_tokens?: number; output_tokens?: number };
  num_turns?: number;
  is_error?: boolean;
  result?: unknown;
}

/** Parse optional telemetry defensively; reject incompatible terminal evidence. */
export function parseStreamLine(raw: string, secrets: Array<string | undefined> = []): AgentUpdate[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let obj: Line;
  try {
    obj = JSON.parse(trimmed) as Line;
  } catch {
    return [{ kind: 'opaque' }]; // not JSON → opaque, honest
  }
  if (!obj || typeof obj !== 'object') return [{ kind: 'opaque' }];

  switch (obj.type) {
    case 'system':
      return obj.subtype === 'init' ? [{ kind: 'started' }] : [];

    case 'assistant': {
      const content = obj.message?.content;
      if (!Array.isArray(content)) return [{ kind: 'opaque' }];
      const out: AgentUpdate[] = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          out.push({ kind: 'tool', name: redact(block.name, secrets).slice(0, 80) });
        } else if (block.type === 'text' && typeof block.text === 'string') {
          const firstLine = redact(block.text, secrets).split('\n').find((l) => l.trim())?.slice(0, 80);
          if (firstLine) out.push({ kind: 'progress', text: firstLine });
        }
      }
      return out;
    }

    case 'user':
      return []; // tool results — no user-facing update needed

    case 'result':
      {
        const success = obj.subtype === 'success';
        const failure = typeof obj.subtype === 'string' && obj.subtype.startsWith('error_');
        const counter = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
        if ((obj.subtype !== undefined && !success && !failure)
          || (obj.is_error !== undefined && typeof obj.is_error !== 'boolean')
          || (!success && !failure && typeof obj.is_error !== 'boolean')
          || (success && obj.is_error === true) || (failure && obj.is_error === false)
          || !counter(obj.num_turns)
          || (obj.usage !== undefined && (!obj.usage || typeof obj.usage !== 'object' || Array.isArray(obj.usage)))
          || !counter(obj.usage?.input_tokens) || !counter(obj.usage?.output_tokens)) {
          throw new Error('Claude result protocol is incompatible');
        }
      }
      return [
        {
          kind: 'done',
          ok: obj.is_error !== true && !(typeof obj.subtype === 'string' && obj.subtype.startsWith('error')),
          tokensIn: typeof obj.usage?.input_tokens === 'number' ? obj.usage.input_tokens : null,
          tokensOut: typeof obj.usage?.output_tokens === 'number' ? obj.usage.output_tokens : null,
          turns: typeof obj.num_turns === 'number' ? obj.num_turns : null,
          // The agent's final message — consumers parse it for verified-outcome markers
          // (e.g. TestFlight). Absent/non-string → null, never a guess.
          resultText: typeof obj.result === 'string' ? redact(obj.result, secrets).slice(0, RESULT_TEXT_CAP) : null,
        },
      ];

    default:
      // Unknown/added type → opaque. We keep running and logging start/end/exit.
      return [{ kind: 'opaque' }];
  }
}
