/**
 * Agent run contracts — the REST shape of the run log (the `runs` table) plus the live
 * per-run timeline. This is what turns dispatched agents from fire-and-forget into
 * inspectable runs: history across restarts, a tool-by-tool timeline while running, the
 * agent's final report, and kill/cancel.
 *
 * Zod at the boundary (convention 2): the web parses these instead of as-casting.
 * Honesty rules carried in the shape itself: every unknown is null (tokens/turns/exit code
 * before finish), and `timelineState` says WHY a timeline may be missing — 'ended' runs keep
 * only what was persisted (the final report), never a reconstructed fake timeline.
 */
import { z } from 'zod';

export const AgentRunStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

/** One row of the persisted run log. */
export const AgentRun = z.object({
  id: z.string(),
  repoId: z.string(),
  task: z.string(),
  model: z.string(),
  status: AgentRunStatus,
  startedTs: z.string(),
  endedTs: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  tokensIn: z.number().int().nullable(),
  tokensOut: z.number().int().nullable(),
  turns: z.number().int().nullable(),
  exitCode: z.number().int().nullable(),
  /** Honest annotation: 'orphaned on boot', 'opaque stream', 'killed from the dashboard', … */
  note: z.string().nullable(),
});
export type AgentRun = z.infer<typeof AgentRun>;

/** One live-timeline entry (kept in memory while the run lives — bounded ring). */
export const RunTimelineEntry = z.object({
  ts: z.string(),
  kind: z.enum(['status', 'tool', 'progress']),
  text: z.string(),
});
export type RunTimelineEntry = z.infer<typeof RunTimelineEntry>;

export const RunDetail = AgentRun.extend({
  /**
   * live  = the run is in flight, timeline grows (poll again);
   * ended = finished while the server was up — the captured timeline is complete;
   * unavailable = the run predates this server boot — the live timeline died with the old
   *               process (honest absence; the persisted summary + final report remain).
   */
  timelineState: z.enum(['live', 'ended', 'unavailable']),
  timeline: z.array(RunTimelineEntry),
  /** The agent's final message (capped), when the stream carried one. */
  resultText: z.string().nullable(),
});
export type RunDetail = z.infer<typeof RunDetail>;

/** One aggregation bucket (a repo or a model) — exact sums over stored rows, never estimates. */
export const RunStatsSlice = z.object({
  key: z.string(),
  runs: z.number().int().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
});
export type RunStatsSlice = z.infer<typeof RunStatsSlice>;

/**
 * Roll-up of the run log over a window. Tokens are EXACT sums of what the CLI reported per
 * run — runs whose stream carried no usage data count in `runsWithoutUsage` (and contribute
 * zero) instead of being guessed. Deliberately no dollar figure: price tables drift, and a
 * computed cost would be a fabricated number (convention 1).
 */
export const RunStats = z.object({
  windowDays: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  byStatus: z.object({
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  totalDurationMs: z.number().int().nonnegative(),
  runsWithoutUsage: z.number().int().nonnegative(),
  byRepo: z.array(RunStatsSlice),
  byModel: z.array(RunStatsSlice),
});
export type RunStats = z.infer<typeof RunStats>;
