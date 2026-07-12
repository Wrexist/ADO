/**
 * Versioned adapter for `claude -p --output-format stream-json` (council B5).
 *
 * This is an UNSTABLE external interface — its shape changes between Claude Code
 * releases. So parsing is defensive and centralized here: a line we recognize becomes
 * a normalized AgentUpdate; anything we DON'T recognize becomes `{ kind: 'opaque' }`,
 * which the runner renders as "running (opaque)" with no guessed percentage. The agent
 * never crashes and never invents progress, whatever GitHub^H^HClaude ships next.
 */

export type AgentUpdate =
  | { kind: 'started' }
  | { kind: 'tool'; name: string }
  | { kind: 'progress'; text: string }
  | { kind: 'done'; ok: boolean; tokensIn: number | null; tokensOut: number | null; turns: number | null }
  | { kind: 'opaque' };

interface Line {
  type?: unknown;
  subtype?: unknown;
  message?: { content?: Array<{ type?: string; name?: string; text?: string }> };
  usage?: { input_tokens?: number; output_tokens?: number };
  num_turns?: number;
  is_error?: boolean;
}

/** Parse one JSONL line into zero or more normalized updates. Never throws. */
export function parseStreamLine(raw: string): AgentUpdate[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let obj: Line;
  try {
    obj = JSON.parse(trimmed) as Line;
  } catch {
    return [{ kind: 'opaque' }]; // not JSON → opaque, honest
  }

  switch (obj.type) {
    case 'system':
      return obj.subtype === 'init' ? [{ kind: 'started' }] : [];

    case 'assistant': {
      const content = obj.message?.content;
      if (!Array.isArray(content)) return [{ kind: 'opaque' }];
      const out: AgentUpdate[] = [];
      for (const block of content) {
        if (block.type === 'tool_use' && typeof block.name === 'string') {
          out.push({ kind: 'tool', name: block.name });
        } else if (block.type === 'text' && typeof block.text === 'string') {
          const firstLine = block.text.split('\n').find((l) => l.trim())?.slice(0, 80);
          if (firstLine) out.push({ kind: 'progress', text: firstLine });
        }
      }
      return out;
    }

    case 'user':
      return []; // tool results — no user-facing update needed

    case 'result':
      return [
        {
          kind: 'done',
          ok: obj.is_error !== true,
          tokensIn: typeof obj.usage?.input_tokens === 'number' ? obj.usage.input_tokens : null,
          tokensOut: typeof obj.usage?.output_tokens === 'number' ? obj.usage.output_tokens : null,
          turns: typeof obj.num_turns === 'number' ? obj.num_turns : null,
        },
      ];

    default:
      // Unknown/added type → opaque. We keep running and logging start/end/exit.
      return [{ kind: 'opaque' }];
  }
}
