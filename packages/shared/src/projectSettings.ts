/**
 * Per-project settings — feature switches saved per repo, plus the GitHub link info the
 * project page renders (PR buttons).
 *
 * Adding a project-level feature is deliberately one step: add a row to PROJECT_FEATURES
 * and consult `isEnabled(repoId, '<id>')` at the feature's choke point on the server. The
 * settings UI, storage, API, and defaults all key off this catalog — nothing else to wire.
 *
 * Leaf module (zod only) — safe to import anywhere without cycles.
 */
import { z } from 'zod';

export const ProjectFeatureId = z.enum(['agents', 'autoReview', 'automations', 'notifications']);
export type ProjectFeatureId = z.infer<typeof ProjectFeatureId>;

export interface ProjectFeature {
  id: ProjectFeatureId;
  name: string;
  blurb: string;
  /** Default when the user has never touched the switch. */
  defaultOn: boolean;
}

/** The catalog the settings panel renders and the server defaults from. */
export const PROJECT_FEATURES: ProjectFeature[] = [
  {
    id: 'agents',
    name: 'Agent dispatch',
    blurb: 'Let AI agents run in this project — the command box, prompts, automations, and fix buttons all dispatch here.',
    defaultOn: true,
  },
  {
    id: 'autoReview',
    name: 'Auto-Review',
    blurb: 'Structured AI code review of every new commit (needs an Anthropic key; enabling starts from the current commit).',
    defaultOn: false, // opt-in — reviews cost real model calls
  },
  {
    id: 'automations',
    name: 'Automations',
    blurb: 'Run this project’s saved automations on their schedules and CI events (manual runs stay available).',
    defaultOn: true,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    blurb: 'Ping connected Slack/Discord webhooks about this project’s builds, deploys, and review verdicts.',
    defaultOn: true,
  },
];

export const FEATURE_BY_ID: Record<ProjectFeatureId, ProjectFeature> = Object.fromEntries(
  PROJECT_FEATURES.map((f) => [f.id, f]),
) as Record<ProjectFeatureId, ProjectFeature>;

/** Write shape for the settings endpoint (validated at the server boundary). */
export const ProjectSettingsPatch = z.object({
  feature: ProjectFeatureId,
  enabled: z.boolean(),
});
export type ProjectSettingsPatch = z.infer<typeof ProjectSettingsPatch>;

/** The full per-repo switch map the API returns (every feature present, defaults applied). */
export type ProjectFeatureMap = Record<ProjectFeatureId, boolean>;

// —— GitHub link info (project page: View on GitHub · New PR · Open PR #n) ————————————

// Zod contract (convention 2): the web client PARSES this payload at the boundary instead
// of as-casting — a drifted field fails loudly, never renders as undefined/garbage.
export const ProjectGitInfo = z.object({
  branch: z.string(),
  /** origin URL as configured, or null when the repo has no remote. */
  remoteUrl: z.string().nullable(),
  /** Present only when origin is a github.com remote. */
  github: z
    .object({ owner: z.string(), repo: z.string(), webUrl: z.string(), newPrUrl: z.string() })
    .nullable(),
  /** The open PR for the current branch, when it could actually be checked. mergeable/checks
   *  are null when GitHub hasn't computed them or the token can't see them (honest unknown). */
  openPr: z
    .object({
      number: z.number().int(),
      title: z.string(),
      url: z.string(),
      mergeable: z.boolean().nullable(),
      checks: z.enum(['passing', 'failing', 'pending']).nullable(),
    })
    .nullable(),
  /**
   * Why openPr is (or isn't) trustworthy — honest provenance, never a silent null:
   * checked = GitHub was asked · no-token = connect GitHub to check · not-github = no
   * github.com remote · error = the check failed.
   */
  prState: z.enum(['checked', 'no-token', 'not-github', 'error']),
});
export type ProjectGitInfo = z.infer<typeof ProjectGitInfo>;
