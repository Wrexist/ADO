/**
 * Deep review — an opt-in, per-project run of `claude ultrareview` (the CLI's cloud-hosted
 * multi-agent code review of the current branch). It's the one real headless multi-agent
 * capability the dashboard can drive; it spends the user's Claude subscription, so it's a
 * manual button, never an automation trigger. Output is streamed raw and honestly (we don't
 * parse structured findings we can't guarantee across CLI versions).
 *
 * Zod contract (convention 2): the web client PARSES run payloads through this schema
 * instead of as-casting, so a server-side shape drift fails loudly at the boundary.
 */
import { z } from 'zod';

export const ReviewRunStatus = z.enum(['running', 'done', 'failed']);
export type ReviewRunStatus = z.infer<typeof ReviewRunStatus>;

export const ReviewRun = z.object({
  runId: z.string(),
  repoId: z.string(),
  status: ReviewRunStatus,
  command: z.string(), // the exact command run (shown to the user; not secret)
  output: z.array(z.string()), // stdout+stderr lines, in order
  code: z.number().int().nullable(),
  startedTs: z.string(),
  endedTs: z.string().nullable(),
});
export type ReviewRun = z.infer<typeof ReviewRun>;
