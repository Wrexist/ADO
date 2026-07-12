/**
 * Deep review — an opt-in, per-project run of `claude ultrareview` (the CLI's cloud-hosted
 * multi-agent code review of the current branch). It's the one real headless multi-agent
 * capability the dashboard can drive; it spends the user's Claude subscription, so it's a
 * manual button, never an automation trigger. Output is streamed raw and honestly (we don't
 * parse structured findings we can't guarantee across CLI versions).
 */
export type ReviewRunStatus = 'running' | 'done' | 'failed';

export interface ReviewRun {
  runId: string;
  repoId: string;
  status: ReviewRunStatus;
  command: string; // the exact command run (shown to the user; not secret)
  output: string[]; // stdout+stderr lines, in order
  code: number | null;
  startedTs: string;
  endedTs: string | null;
}
