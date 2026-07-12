/**
 * Per-repo automations — a saved prompt/recipe bound to a repo that runs on command, on a
 * schedule, or on an event (a real CI failure/success). Running = the server dispatches a
 * headless `claude -p` agent in that repo (same path as the command center / Prompt Library),
 * so automations only do real, verifiable work — never fabricate output.
 *
 * The built-in TEMPLATES are the one-click "standard prompts" for each kind of project,
 * including mobile-app and game recipes. They prefill an editable task; nothing is locked.
 */
import { z } from 'zod';

/** When an automation fires. */
export const AutomationTrigger = z.discriminatedUnion('on', [
  z.object({ on: z.literal('manual') }),
  z.object({ on: z.literal('schedule'), every: z.enum(['hour', 'day', 'week']) }),
  // Fires only on REAL CI/scan events (not the automation's own runner builds — no loops).
  z.object({ on: z.literal('event'), event: z.enum(['build.failed', 'build.success']) }),
]);
export type AutomationTrigger = z.infer<typeof AutomationTrigger>;

export const TRIGGER_INTERVAL_MS: Record<'hour' | 'day' | 'week', number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** Write shape (validated at the server boundary). */
export const AutomationInput = z.object({
  id: z.string().optional(),
  repoId: z.string().min(1),
  name: z.string().min(1).max(80),
  task: z.string().min(1).max(4000), // the prompt dispatched to the agent
  model: z.string().max(60).optional(),
  trigger: AutomationTrigger,
  enabled: z.boolean().default(true),
  /** Where it came from — for display/traceability only. */
  source: z.object({ kind: z.enum(['prompt', 'workflow', 'custom']), ref: z.string().optional() }).optional(),
});
export type AutomationInputT = z.infer<typeof AutomationInput>;

/** Stored shape returned to the client. */
export interface Automation {
  id: string;
  repoId: string;
  name: string;
  task: string;
  model?: string;
  trigger: AutomationTrigger;
  enabled: boolean;
  source?: { kind: 'prompt' | 'workflow' | 'custom'; ref?: string };
  createdTs: string;
  lastRunTs: string | null;
  lastRunId: string | null;
}

/** Is a scheduled automation due to run again? */
export function isScheduleDue(trigger: AutomationTrigger, lastRunMs: number | null, nowMs: number): boolean {
  if (trigger.on !== 'schedule') return false;
  if (lastRunMs === null) return true; // never run → due
  return nowMs - lastRunMs >= TRIGGER_INTERVAL_MS[trigger.every];
}

/** Does an incoming bus event fire this automation? */
export function eventMatches(trigger: AutomationTrigger, eventName: 'build.failed' | 'build.success'): boolean {
  return trigger.on === 'event' && trigger.event === eventName;
}

// —— built-in templates (the one-click standard prompts per project kind) ————————————

export interface AutomationTemplate {
  id: string;
  name: string;
  /** Which project kinds this suits — the UI surfaces matching ones first per repo category. */
  category: 'general' | 'game' | 'mobile' | 'steam' | 'app' | 'web';
  blurb: string;
  task: string;
  suggestedTrigger: AutomationTrigger;
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ── General ───────────────────────────────────────────────────────────────
  {
    id: 'fix-failed-build',
    name: 'Fix the failed build',
    category: 'general',
    blurb: 'When CI goes red, an agent diagnoses and fixes it.',
    task: 'The latest CI build for this repo failed. Read the failing job output and the recent diff, find the root cause, implement the smallest correct fix, and re-run the checks. Report exactly what broke and what you changed. Do not claim a pass you did not verify.',
    suggestedTrigger: { on: 'event', event: 'build.failed' },
  },
  {
    id: 'weekly-changelog',
    name: 'Weekly changelog draft',
    category: 'general',
    blurb: 'A drafted changelog from the week’s real git history.',
    task: 'Summarise what actually changed in this repo over the last week from git history. Draft concise changelog entries grouped into Features / Fixes / Chore. Only include changes present in the history — invent nothing. This is a single-shot draft for me to edit.',
    suggestedTrigger: { on: 'schedule', every: 'week' },
  },
  {
    id: 'dep-security-scan',
    name: 'Dependency & security check',
    category: 'general',
    blurb: 'Flags vulnerable/outdated deps with safe upgrades.',
    task: 'Audit this repo’s dependencies for known vulnerabilities and outdated majors. Produce a checklist of safe patch/minor upgrades to apply, and list risky majors separately with migration notes. Do not upgrade blindly or claim fixes you have not made.',
    suggestedTrigger: { on: 'schedule', every: 'week' },
  },
  // ── Games ─────────────────────────────────────────────────────────────────
  {
    id: 'game-playtest-bughunt',
    name: 'Nightly playtest bug-hunt',
    category: 'game',
    blurb: 'Exercises core loops + edge cases, files real repros.',
    task: 'Do a playtest-oriented bug hunt on this game: exercise the core loops and edge cases (save/load, boundary states, resource under/overflow, rapid input, pause/resume), find reproducible bugs with concrete repro steps, and propose the smallest fix for each. Only report bugs you can actually reproduce from the code.',
    suggestedTrigger: { on: 'schedule', every: 'day' },
  },
  {
    id: 'game-balance-pass',
    name: 'Balance & difficulty pass',
    category: 'game',
    blurb: 'Finds dominant/dead strategies and pacing issues.',
    task: 'Review this game’s balance and difficulty curve from its systems and config. Identify dominant or dead strategies and pacing problems, and propose specific, reversible tuning changes with the reasoning and the values to change. Ground every claim in the actual systems code/config.',
    suggestedTrigger: { on: 'manual' },
  },
  {
    id: 'game-patch-notes',
    name: 'Patch notes from commits',
    category: 'game',
    blurb: 'Player-facing notes from real recent commits.',
    task: 'Generate player-facing patch notes from this repo’s recent commit history, grouped into New / Balance / Fixes, in the game’s voice. Only include changes actually present in the history. Single-shot draft for me to edit.',
    suggestedTrigger: { on: 'manual' },
  },
  // ── Steam ─────────────────────────────────────────────────────────────────
  {
    id: 'steam-release-checklist',
    name: 'Steam release readiness',
    category: 'steam',
    blurb: 'Checklist of what still blocks a Steam release.',
    task: 'Assess Steam release readiness for this build: Steamworks integration (achievements, cloud saves, rich presence), store assets, depots/branches, and a smoke pass. Produce a readiness checklist and clearly flag anything that would block shipping. Report only real gaps found in the repo.',
    suggestedTrigger: { on: 'manual' },
  },
  // ── Mobile ────────────────────────────────────────────────────────────────
  {
    id: 'mobile-testflight-prep',
    name: 'TestFlight build prep',
    category: 'mobile',
    blurb: 'Pre-submission checks + what blocks an upload.',
    task: 'Prepare this iOS app for a TestFlight build: check the build number bump, signing/entitlements/Info.plist, and run the pre-submission checks. Produce a checklist of anything blocking an upload. Do not fabricate passing checks — report real state.',
    suggestedTrigger: { on: 'manual' },
  },
  {
    id: 'mobile-store-metadata',
    name: 'App Store metadata draft',
    category: 'mobile',
    blurb: 'Title/subtitle/keywords/description + screenshot plan.',
    task: 'Draft App Store / Play Store metadata for this app: title, subtitle, keyword set, and description, plus a screenshot capture plan mapped to the app’s key screens. Copy is a single-shot draft for me to edit — do not loop on it.',
    suggestedTrigger: { on: 'manual' },
  },
  {
    id: 'mobile-perf-a11y',
    name: 'Performance & accessibility audit',
    category: 'mobile',
    blurb: 'Startup/jank/memory + labels/contrast/touch targets.',
    task: 'Audit this mobile app for performance (startup time, jank, memory) and accessibility (labels, contrast, dynamic type, touch-target size). Report concrete findings with file references and the fix for each. Ground every finding in the real code.',
    suggestedTrigger: { on: 'manual' },
  },
  // ── App / Web ─────────────────────────────────────────────────────────────
  {
    id: 'app-crash-triage',
    name: 'Crash / error triage',
    category: 'app',
    blurb: 'Clusters recent errors by root cause, ranks by impact.',
    task: 'Triage this app’s recent crash/error reports and logs: cluster by root cause, rank by user impact, and propose a fix for the top issues with file references. Only include issues supported by the logs/code.',
    suggestedTrigger: { on: 'manual' },
  },
];
