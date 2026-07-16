/**
 * Auto-Review contracts — structured AI code review of a repo's latest change.
 *
 * A review is READ-ONLY by construction: the server collects a bounded `git diff` (execFile,
 * no shell, cwd from the scanner allow-list), sends it to the reviewer as DATA to analyze
 * (convention 11 — never instructions), and stores the structured verdict + findings as bus
 * events. Reviews are produced ONLY by the real model: with no Anthropic key connected there
 * is no heuristic that invents findings — the honest degraded state is "connect a key"
 * (convention 1: no fabricated review is ever rendered).
 *
 * Applying a fix is a separate, CONFIRMED dispatch through the runner (same rule as incidents:
 * nothing acts without confirm).
 *
 * Self-contained leaf (only zod) so state.ts can import these without an import cycle.
 */
import { z } from 'zod';

const isoTs = z.string().datetime({ offset: true });

export const ReviewSeverity = z.enum(['info', 'minor', 'major', 'critical']);
export type ReviewSeverity = z.infer<typeof ReviewSeverity>;

export const ReviewCategory = z.enum(['correctness', 'security', 'performance', 'maintainability', 'testing']);
export type ReviewCategory = z.infer<typeof ReviewCategory>;

/** What kicked the review off. 'commit' = the engine noticed a new HEAD on an enabled repo. */
export const ReviewTrigger = z.enum(['manual', 'commit']);
export type ReviewTrigger = z.infer<typeof ReviewTrigger>;

export const ReviewStatus = z.enum(['running', 'done', 'failed']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

/** Overall call: clean = ship it · attention = real issues worth reading · block = don't ship. */
export const ReviewVerdict = z.enum(['clean', 'attention', 'block']);
export type ReviewVerdict = z.infer<typeof ReviewVerdict>;

export const ReviewFinding = z.object({
  severity: ReviewSeverity,
  category: ReviewCategory,
  /** Repo-relative path, grounded in the diff (the server drops paths not present in it). */
  file: z.string(),
  line: z.number().int().positive().optional(),
  title: z.string(),
  detail: z.string(), // what's wrong and why it matters
  suggestion: z.string(), // the concrete change that would fix it
});
export type ReviewFinding = z.infer<typeof ReviewFinding>;

export const MAX_FINDINGS = 20; // hard cap — a review is a signal, not a firehose

export const AutoReview = z.object({
  id: z.string(),
  repoId: z.string(),
  ts: isoTs, // last update time (running → done/failed refreshes it)
  trigger: ReviewTrigger,
  /** What was reviewed: a commit sha, or 'working-tree' for uncommitted changes. */
  ref: z.string(),
  /** Human label: "a1b2c3d · fix wave spawner" or "uncommitted changes on main". */
  refLabel: z.string(),
  /** Which model produced it — stored provenance, never implied. */
  model: z.string(),
  status: ReviewStatus,
  /** Present only when status = 'done' (an honest absence while running/failed). */
  verdict: ReviewVerdict.optional(),
  summary: z.string().optional(),
  findings: z.array(ReviewFinding).max(MAX_FINDINGS),
  /** Present only when status = 'failed' — the honest reason (e.g. "connect an Anthropic key"). */
  error: z.string().optional(),
  /** Real diff stats from git --numstat; absent when the diff couldn't be measured. */
  stats: z.object({ files: z.number().int().nonnegative(), additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative() }).optional(),
});
export type AutoReview = z.infer<typeof AutoReview>;

/** Per-repo Auto-Review settings row returned by the API (never contains secrets). */
export interface AutoReviewSettings {
  repoId: string;
  enabled: boolean;
  /** Baseline sha: only commits AFTER this are auto-reviewed (seeded when enabling). */
  lastSha: string | null;
}

/** Severity → weight used to derive a chip/ordering; UI maps severities to tones itself. */
export const SEVERITY_ORDER: Record<ReviewSeverity, number> = { critical: 3, major: 2, minor: 1, info: 0 };

/** Sort findings most-severe first (stable within a severity). */
export function sortFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
}
