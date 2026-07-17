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
