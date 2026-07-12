/**
 * Prompt Library — a curated, model-optimized set of prompts the user can grab and run
 * for real project work (games, mobile, Steam, apps, web, backend, testing, perf,
 * security, refactor, docs, devops). Built-ins live here; the user's own prompts are
 * stored server-side and merged in the UI.
 *
 * "Optimized for the AI selected": each prompt has a general `body`; when a target model
 * is chosen, `renderPrompt` prepends that model's tuning preamble and uses a per-model
 * `variant` if one is hand-tuned. So the same prompt comes out shaped for Claude vs GPT
 * vs Gemini without duplicating every prompt.
 */
import { z } from 'zod';

/** Single source for the category set — the zod enum; the TS type is inferred from it. */
export const PromptCategoryEnum = z.enum([
  'game',
  'mobile',
  'steam',
  'app',
  'web',
  'backend',
  'testing',
  'performance',
  'security',
  'refactor',
  'docs',
  'devops',
]);
export type PromptCategory = z.infer<typeof PromptCategoryEnum>;

export const TargetModelEnum = z.enum(['any', 'claude', 'gpt', 'gemini']);
export type TargetModel = z.infer<typeof TargetModelEnum>;

export interface PromptTemplate {
  id: string;
  title: string;
  category: PromptCategory;
  tags: string[];
  summary: string; // one-line "when to use"
  recommendedModel: TargetModel;
  body: string; // the optimized prompt (with {placeholders})
  variants?: Partial<Record<'claude' | 'gpt' | 'gemini', string>>;
  /** True = this prompt is a good fit to dispatch to an agent as-is. */
  dispatchable: boolean;
  /** Built-in vs a user-added custom prompt (custom ones are editable/deletable). */
  custom?: boolean;
}

export interface PromptCategoryMeta {
  id: PromptCategory;
  title: string;
  blurb: string;
}

export const PROMPT_CATEGORIES: PromptCategoryMeta[] = [
  { id: 'game', title: 'Game Dev', blurb: 'Mechanics, systems, balance, and engine work.' },
  { id: 'mobile', title: 'Mobile', blurb: 'iOS, Android, and React Native.' },
  { id: 'steam', title: 'Steam Release', blurb: 'Steamworks integration and shipping to Steam.' },
  { id: 'app', title: 'App Features', blurb: 'End-to-end features and bug fixes.' },
  { id: 'web', title: 'Web', blurb: 'React components, pages, SEO, perf.' },
  { id: 'backend', title: 'Backend & Data', blurb: 'APIs, schemas, migrations.' },
  { id: 'testing', title: 'Testing', blurb: 'Unit, E2E, and flaky-test hunts.' },
  { id: 'performance', title: 'Performance', blurb: 'Profiling and hot-path optimization.' },
  { id: 'security', title: 'Security', blurb: 'Reviews and dependency audits.' },
  { id: 'refactor', title: 'Refactor', blurb: 'Readability, reuse, and cleanup.' },
  { id: 'docs', title: 'Docs', blurb: 'READMEs and API docs.' },
  { id: 'devops', title: 'DevOps', blurb: 'CI/CD, Docker, releases.' },
];

/** Per-model tuning preamble — applied to every prompt when that model is selected. */
export const MODEL_TUNING: Record<TargetModel, string> = {
  any: '',
  claude:
    'You are Claude. Before non-trivial work, plan in a short bulleted list, then execute. Make surgical, minimal diffs that match the existing code style. State any assumptions explicitly and stop to ask only if truly blocked.',
  gpt:
    'You are GPT. Reason step by step. Return complete, runnable files or unified diffs — never leave placeholders or “…”. Be explicit about file paths and commands.',
  gemini:
    'You are Gemini. Work in numbered steps and finish each fully. Be concise and concrete; prefer a small example over a long explanation.',
};

/** Compose the final prompt text for a given model (tuning preamble + best body). */
export function renderPrompt(p: PromptTemplate, model: TargetModel): string {
  const body = (model !== 'any' && p.variants?.[model]) || p.body;
  const preamble = MODEL_TUNING[model];
  return preamble ? `${preamble}\n\n---\n\n${body}` : body;
}

const P = (p: PromptTemplate): PromptTemplate => p;

export const PROMPTS: PromptTemplate[] = [
  // ── Game Dev ───────────────────────────────────────────────────────────────
  P({
    id: 'game-feature',
    title: 'Implement a game feature',
    category: 'game',
    tags: ['unity', 'godot', 'gameplay'],
    summary: 'Add a well-scoped gameplay feature with clean, testable systems.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Role: senior game engineer on {engine} ({language}).
Feature: {feature}.
Constraints:
- Keep gameplay code decoupled from rendering/input; use the project's existing patterns (components/signals/ECS as applicable).
- No allocations in per-frame hot paths; pool where sensible.
- Deterministic where it affects gameplay (seedable RNG).
Deliver:
1. A short plan (systems touched, new files).
2. The implementation as minimal diffs.
3. One play-test checklist and any editor/inspector wiring needed.
Acceptance: feature works in-editor, no new warnings, frame time unchanged in a typical scene.`,
    variants: {
      gpt: `You are a senior {engine} game engineer ({language}). Implement: {feature}.
Think step by step, then output complete files/diffs (no placeholders).
Rules: decouple gameplay from rendering/input; zero per-frame allocations (pool); seedable RNG for gameplay-affecting randomness.
Return: (1) plan, (2) full code, (3) a play-test checklist. Acceptance: works in-editor, no new warnings, stable frame time.`,
    },
  }),
  P({
    id: 'game-mechanic-balance',
    title: 'Design & balance a game mechanic',
    category: 'game',
    tags: ['design', 'balance', 'tuning'],
    summary: 'Turn a rough mechanic idea into tunable, data-driven numbers.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Role: game designer + engineer. Mechanic: {mechanic}.
1. Define the player fantasy and the decision it creates in one paragraph.
2. Model it as data (a table of tunable parameters with sane defaults and ranges) — externalize to {config format} so designers tune without recompiling.
3. Implement the mechanic reading from that data.
4. Give 3 balance presets (easy/standard/hard) and the reasoning.
Do NOT hardcode magic numbers in logic — everything tunable lives in the data table.`,
  }),
  P({
    id: 'game-perf',
    title: 'Optimize game performance (frame budget)',
    category: 'game',
    tags: ['performance', 'profiling', 'fps'],
    summary: 'Find and fix what blows the frame budget, with before/after evidence.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Role: performance engineer on {engine}. Target: {target fps} on {target device}.
1. Profile first — identify the top 3 costs (CPU, GPU, GC/allocations) with the profiler; do NOT guess.
2. For each, propose the smallest change with the biggest win and estimate the saving.
3. Implement the top wins; avoid premature micro-opts.
4. Report before/after frame time and allocation counts from the same scene.
Never trade correctness or determinism for speed without flagging it.`,
  }),
  P({
    id: 'game-saveload',
    title: 'Add a save/load system',
    category: 'game',
    tags: ['persistence', 'serialization'],
    summary: 'Robust, versioned save/load that survives schema changes.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Implement save/load for {game}.
Requirements: versioned schema with a migration path; atomic writes (temp file → rename) so a crash never corrupts a save; separate slots + autosave; human-diffable format in debug ({format}).
Deliver the serializer, a v1→v2 migration example, and a corruption/recovery test. Never block the main thread on I/O.`,
  }),

  // ── Mobile ───────────────────────────────────────────────────────────────
  P({
    id: 'mobile-screen',
    title: 'New mobile screen',
    category: 'mobile',
    tags: ['ios', 'android', 'react-native', 'ui'],
    summary: 'A production-quality screen wired to state, with loading/empty/error.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Role: senior mobile engineer ({platform}: SwiftUI / Jetpack Compose / React Native).
Build screen: {screen} showing {data}.
Must include: loading, empty, and error states (never a blank screen); pull-to-refresh; accessibility labels + Dynamic Type / font scaling; safe-area handling.
Wire to the existing state layer ({state lib}); no business logic in the view.
Deliver the screen, a preview/storybook entry, and a note on navigation wiring.`,
  }),
  P({
    id: 'mobile-analytics',
    title: 'Wire mobile analytics events',
    category: 'mobile',
    tags: ['analytics', 'events', 'privacy'],
    summary: 'Type-safe analytics for a flow, privacy-aware.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Add analytics to the {flow} flow using {provider}.
Define a typed event enum/schema (no stringly-typed event names). Instrument the key funnel steps: {steps}.
Rules: no PII in event props; respect the user's tracking-consent flag; one thin wrapper so the provider can be swapped.
Deliver the event definitions, the instrumentation diffs, and a table of events → when they fire.`,
  }),
  P({
    id: 'mobile-size-coldstart',
    title: 'Reduce app size & cold-start',
    category: 'mobile',
    tags: ['performance', 'startup', 'bundle'],
    summary: 'Measurable cuts to binary size and time-to-interactive.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Role: mobile perf engineer ({platform}). Goal: cut app size and cold-start.
1. Measure current size (per-arch) and cold-start time; list the biggest contributors (assets, deps, startup work).
2. Propose cuts ranked by win/effort (defer work off the launch path, lazy-init, strip unused assets/deps, enable R8/bitcode/size opts).
3. Implement the top items and re-measure. Report before/after size and TTI.`,
  }),

  // ── Steam ───────────────────────────────────────────────────────────────
  P({
    id: 'steam-integration',
    title: 'Steamworks integration',
    category: 'steam',
    tags: ['steam', 'achievements', 'cloud-saves'],
    summary: 'Achievements, stats, and Cloud saves via Steamworks — safely gated.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Integrate Steamworks into {game} ({engine}).
Scope: {features: achievements / stats / Cloud saves / rich presence}.
Rules: all Steam calls behind an interface so the game runs with Steam absent (dev/other stores) — no hard dependency; init/shutdown handled once; handle "Steam not running" and offline gracefully.
Deliver: the wrapper interface + Steam impl + a no-op impl, achievement/stat definitions mapped to Steam IDs, and a test that the game boots without Steam.`,
  }),
  P({
    id: 'steam-release',
    title: 'Prepare a Steam release',
    category: 'steam',
    tags: ['release', 'depots', 'build-upload'],
    summary: 'Depots, build upload, and a launch checklist for Steam.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Prepare {game} for a Steam {branch: default/beta} release.
1. Draft the depot layout and a steamcmd/SteamPipe build-upload script (parameterized, secrets from env — never hardcoded).
2. Produce a pre-launch checklist: store page assets, build set live, default branch, pricing/region, EULA, system reqs, controller support, cloud-save config, achievements visible.
3. List what must be tested on a clean machine before going live.
Output the script + the checklist as a markdown doc.`,
  }),
  P({
    id: 'steam-launch-checklist',
    title: 'Steam wishlist & launch plan',
    category: 'steam',
    tags: ['marketing', 'launch', 'wishlist'],
    summary: 'A concrete, dated launch/wishlist plan (copy is yours to edit).',
    recommendedModel: 'any',
    dispatchable: false,
    body: `Draft a Steam launch plan for {game} targeting {date}.
Cover: wishlist-building beats before launch, Next Fest/demo timing, store-page conversion checklist, launch-day sequence, and a 2-week post-launch patch cadence.
Keep it a checklist with dates relative to launch. This is a DRAFT for me to edit — do not invent review quotes, numbers, or press contacts.`,
  }),

  // ── App features ───────────────────────────────────────────────────────────
  P({
    id: 'app-feature-e2e',
    title: 'Ship a feature end-to-end',
    category: 'app',
    tags: ['feature', 'full-stack'],
    summary: 'From spec to tested, shippable feature.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Implement end-to-end: {feature}.
1. Restate the goal + acceptance criteria in one paragraph; note edge cases.
2. Plan the slice (data → API → UI) and the files touched.
3. Implement with minimal diffs, matching existing patterns.
4. Add tests for the acceptance criteria and the trickiest edge case.
5. Update docs/CHANGELOG if the project keeps them.
Stop and flag if the spec is ambiguous rather than guessing product intent.`,
  }),
  P({
    id: 'app-bugfix',
    title: 'Fix a bug from a report',
    category: 'app',
    tags: ['bug', 'debugging'],
    summary: 'Reproduce, root-cause, fix, and regression-test.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Bug report: {report}.
1. Reproduce it (write the failing test FIRST if possible).
2. Find the root cause — explain WHY it happens, not just where.
3. Fix the cause, not the symptom; keep the diff minimal.
4. Keep the regression test green and check for the same bug class elsewhere.
Report: root cause, the fix, and anything the fix could have affected.`,
  }),

  // ── Web ───────────────────────────────────────────────────────────────────
  P({
    id: 'web-component',
    title: 'New React component/page',
    category: 'web',
    tags: ['react', 'ui', 'a11y'],
    summary: 'Accessible, typed component that matches the design system.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Build a {component/page}: {spec}.
Rules: TypeScript, no \`any\`; compose from the existing design-system/kit — no raw hex or one-off styles; keyboard-accessible with visible focus; responsive; no layout shift on data load.
Deliver the component, its states (loading/empty/error where relevant), and a usage example.`,
  }),
  P({
    id: 'web-seo-perf',
    title: 'SEO + performance pass',
    category: 'web',
    tags: ['seo', 'performance', 'lighthouse'],
    summary: 'Move real Core Web Vitals + SEO numbers, with evidence.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Do an SEO + performance pass on {page/site}.
1. Measure first (Lighthouse/Core Web Vitals) and list the top issues by impact.
2. Fix: LCP (image/loading), CLS (reserved space), TBT (JS), plus meta/OG/sitemap/robots/structured-data gaps.
3. Re-measure and report before/after. Don't chase a perfect score at the cost of UX.`,
  }),

  // ── Backend & data ─────────────────────────────────────────────────────────
  P({
    id: 'backend-endpoint',
    title: 'Design an API endpoint',
    category: 'backend',
    tags: ['api', 'rest', 'graphql', 'validation'],
    summary: 'A validated, tested endpoint that fits the existing API.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Add endpoint: {method path} — {purpose}.
Rules: validate input at the boundary (schema); auth/authz consistent with existing endpoints; typed responses; explicit error shapes with correct status codes; no N+1 queries.
Deliver the handler, the input/output types/schemas, and tests for happy path + one auth failure + one validation failure.`,
  }),
  P({
    id: 'backend-migration',
    title: 'Database migration + schema change',
    category: 'backend',
    tags: ['database', 'migration', 'schema'],
    summary: 'A safe, reversible migration with zero-downtime intent.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Schema change: {change}.
Rules: forward migration + a tested rollback; backfill plan for existing rows; expand-then-contract for zero-downtime (add nullable → backfill → enforce → drop old); never a destructive change without an explicit callout.
Deliver the migration files, the backfill step, and how to verify it on a copy before prod.`,
  }),

  // ── Testing ────────────────────────────────────────────────────────────────
  P({
    id: 'test-add',
    title: 'Add tests for a module',
    category: 'testing',
    tags: ['unit', 'coverage'],
    summary: 'Meaningful tests for behavior, not coverage theater.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Add tests for {module}.
Cover: the happy path, boundary values, error/exception paths, and the one behavior most likely to regress. Assert BEHAVIOR and outputs, not implementation details. Use the project's test runner and conventions. No flaky time/network dependencies — fake them.
Report what's now covered and any bug the tests surfaced.`,
  }),
  P({
    id: 'test-flaky',
    title: 'Reproduce & fix a flaky test',
    category: 'testing',
    tags: ['flaky', 'ci', 'determinism'],
    summary: 'Make an intermittently-failing test deterministic.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Flaky test: {test}.
1. Run it in a loop to reproduce; capture the failing interleaving.
2. Root-cause the nondeterminism (timing, ordering, shared state, real clock/network, test pollution).
3. Fix the cause (fake the clock, isolate state, await properly) — do NOT just add retries or sleeps.
Prove it: the test passes N consecutive runs.`,
  }),

  // ── Performance / security / refactor / docs / devops ───────────────────────
  P({
    id: 'perf-hotpath',
    title: 'Profile & optimize a hot path',
    category: 'performance',
    tags: ['profiling', 'optimization'],
    summary: 'Data-driven optimization of the actual bottleneck.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Optimize {operation}, currently {symptom}.
1. Measure/profile to find the real bottleneck — never optimize on a hunch.
2. Fix the biggest cost with the smallest change (algorithmic first, then constants).
3. Keep behavior identical; add a benchmark and report before/after with numbers.`,
  }),
  P({
    id: 'sec-review',
    title: 'Security review of a diff',
    category: 'security',
    tags: ['review', 'owasp'],
    summary: 'Find real, exploitable issues in changes — no theater.',
    recommendedModel: 'claude',
    dispatchable: false,
    body: `Security-review this diff/PR: {ref}.
Look for: injection, authz gaps, secrets in code, unsafe deserialization, SSRF, missing input validation, and dependency risks. For each finding give a concrete exploit scenario and the minimal fix. Rank by severity. If you find nothing exploitable, say so plainly — do not pad the report.`,
  }),
  P({
    id: 'sec-deps',
    title: 'Dependency audit & fix',
    category: 'security',
    tags: ['dependencies', 'audit', 'supply-chain'],
    summary: 'Triage vulnerable deps and fix what actually matters.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Audit dependencies for {project}.
1. Run the audit; separate exploitable-in-our-usage from noise.
2. For each real issue: upgrade or patch with the smallest version bump; note breaking changes.
3. Verify the build + tests still pass. Report what was fixed and what was accepted-with-reason.`,
  }),
  P({
    id: 'refactor-clean',
    title: 'Refactor for readability & reuse',
    category: 'refactor',
    tags: ['cleanup', 'dry'],
    summary: 'Behavior-preserving cleanup with tests as the safety net.',
    recommendedModel: 'claude',
    dispatchable: true,
    body: `Refactor {target} for clarity and reuse.
Rules: behavior must not change — rely on existing tests (add characterization tests first if coverage is thin). Extract duplication, name things well, reduce nesting. Small, reviewable commits. No new dependencies without reason. Report what changed and why it's safe.`,
  }),
  P({
    id: 'docs-readme',
    title: 'Write / refresh the README',
    category: 'docs',
    tags: ['readme', 'onboarding'],
    summary: 'A README that gets a stranger running in minutes.',
    recommendedModel: 'any',
    dispatchable: true,
    body: `Write/refresh the README for {project}.
Include: one-line what-it-is, quickstart (clone → install → run, with real commands), key scripts, architecture in 5 lines, and where to go next. Verify every command against the actual project. Keep prose tight. This is a DRAFT for me to edit — don't invent features or benchmarks.`,
  }),
  P({
    id: 'devops-ci',
    title: 'CI pipeline (GitHub Actions)',
    category: 'devops',
    tags: ['ci', 'github-actions'],
    summary: 'A fast, cached CI workflow that gates merges.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Create/improve a GitHub Actions workflow for {project}.
Include: install with dependency caching, typecheck + lint + test + build, run on PR + main, fail fast, and minimal permissions (GITHUB_TOKEN least-privilege). Keep it under {time budget} on cache hit. Output the YAML and a one-line branch-protection recommendation.`,
  }),
  P({
    id: 'devops-docker',
    title: 'Dockerize the app',
    category: 'devops',
    tags: ['docker', 'containers'],
    summary: 'A small, secure multi-stage image.',
    recommendedModel: 'gpt',
    dispatchable: true,
    body: `Dockerize {app}.
Rules: multi-stage build (build → slim runtime); non-root user; pinned base image; .dockerignore; no secrets baked in; healthcheck. Aim for the smallest correct image. Deliver the Dockerfile, .dockerignore, and the build/run commands.`,
  }),
];

/**
 * Specialized agents — "trained" dispatch profiles for the domains Isac ships in
 * (games, apps, mobile, Steam). Each carries a system preamble (the training), a
 * recommended model, and an explicit verifiable LOOP (convention 6: loops run only on
 * work you can check — code, tests, builds — never on copy). Dispatching an agent wraps
 * the chosen prompt with the preamble + loop so the runner iterates instead of one-shots.
 */
export interface SpecializedAgent {
  id: string;
  name: string;
  blurb: string;
  domain: PromptCategory;
  recommendedModel: TargetModel;
  /** The training: how this agent thinks about its domain. */
  systemPreamble: string;
  /** The optimized loop — repeated until the exit check passes. */
  loop: string[];
  /** The check that ends the loop (must be objectively verifiable). */
  exitCheck: string;
  /** Library prompts this agent pairs with (ids into PROMPTS). */
  promptIds: string[];
}

const AGENT = (a: SpecializedAgent): SpecializedAgent => a;

export const AGENTS: SpecializedAgent[] = [
  AGENT({
    id: 'game-dev',
    name: 'Game Developer',
    blurb: 'Ships gameplay systems on Unity/Godot with a frame budget and determinism in mind.',
    domain: 'game',
    recommendedModel: 'claude',
    systemPreamble:
      'You are a senior game engineer. You keep gameplay decoupled from rendering/input, avoid per-frame allocations, and keep gameplay-affecting randomness seedable and deterministic. You externalize tunable numbers to data, never hardcoding balance in logic. You measure frame time before and after any perf change.',
    loop: [
      'Plan the smallest slice (systems touched, new files) as a short bullet list.',
      'Implement it as minimal diffs matching the project’s existing patterns.',
      'Build/run in-editor; capture warnings and frame time in a typical scene.',
      'If it fails the exit check, fix the specific cause and repeat — do not broaden scope.',
    ],
    exitCheck: 'Feature works in-editor, no new warnings, frame time unchanged vs baseline.',
    promptIds: ['game-feature', 'game-mechanic-balance', 'game-perf', 'game-saveload'],
  }),
  AGENT({
    id: 'mobile-dev',
    name: 'Mobile Developer',
    blurb: 'Builds iOS/Android/React-Native screens wired to state, with loading/empty/error and a11y.',
    domain: 'mobile',
    recommendedModel: 'claude',
    systemPreamble:
      'You are a senior mobile engineer (SwiftUI / Jetpack Compose / React Native). Every screen has loading, empty, and error states — never a blank screen. You respect accessibility (labels, Dynamic Type / font scaling), safe areas, and the platform’s idioms. Business logic never lives in the view. You watch app size and cold-start and measure them when you touch the launch path.',
    loop: [
      'Restate the screen/flow goal and its states (loading/empty/error) in one paragraph.',
      'Wire to the existing state layer; keep the view logic-free.',
      'Add a preview/storybook entry and check it renders every state.',
      'If a state is missing or a11y is off, fix and repeat.',
    ],
    exitCheck: 'All states render, accessibility labels present, no business logic in the view.',
    promptIds: ['mobile-screen', 'mobile-analytics', 'mobile-size-coldstart'],
  }),
  AGENT({
    id: 'steam-eng',
    name: 'Steam Release Engineer',
    blurb: 'Integrates Steamworks safely and prepares SteamPipe builds + launch checklists.',
    domain: 'steam',
    recommendedModel: 'claude',
    systemPreamble:
      'You are a release engineer for Steam. All Steam calls go behind an interface so the game runs with Steam absent (dev / other stores). Build-upload scripts are parameterized with secrets from env — never hardcoded. You produce checklists that must be verified on a clean machine before going live.',
    loop: [
      'Gate the integration behind an interface with a no-op fallback.',
      'Map achievements/stats to Steam IDs; handle Steam-not-running and offline.',
      'Draft/upload the SteamPipe build; dry-run the script.',
      'If the game can’t boot without Steam, fix the gating and repeat.',
    ],
    exitCheck: 'Game boots with Steam absent; upload script runs with env secrets; launch checklist complete.',
    promptIds: ['steam-integration', 'steam-release', 'steam-launch-checklist'],
  }),
  AGENT({
    id: 'app-dev',
    name: 'App Feature Builder',
    blurb: 'Ships app features end-to-end (data → API → UI) with tests for the acceptance criteria.',
    domain: 'app',
    recommendedModel: 'claude',
    systemPreamble:
      'You are a full-stack app engineer. You restate acceptance criteria before coding, slice work data → API → UI, make minimal diffs that match existing patterns, and add tests for the acceptance criteria plus the trickiest edge case. You stop and flag ambiguous product intent instead of guessing.',
    loop: [
      'Restate goal + acceptance criteria + edge cases in one paragraph.',
      'Implement the slice with minimal diffs.',
      'Add tests for the criteria and the trickiest edge case; run them.',
      'If a test fails or a criterion is unmet, fix and repeat.',
    ],
    exitCheck: 'All acceptance criteria met and covered by green tests; typecheck clean.',
    promptIds: ['app-feature-e2e', 'app-bugfix', 'web-component', 'backend-endpoint'],
  }),
];

/**
 * Compose the full dispatch text for a specialized agent running a given prompt: the
 * agent's training preamble + its verifiable loop + the model-rendered prompt body. This
 * is what the runner receives, so the agent iterates against the exit check.
 */
export function renderAgentDispatch(
  agent: SpecializedAgent,
  prompt: PromptTemplate,
  model: TargetModel = agent.recommendedModel,
): string {
  const loop = agent.loop.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    agent.systemPreamble,
    `Work in this loop until the exit check passes:\n${loop}`,
    `Exit check: ${agent.exitCheck}`,
    '--- TASK ---',
    renderPrompt(prompt, model),
  ].join('\n\n');
}

/**
 * Validation for a user-added custom prompt. Kept in shared so the web form and the
 * server store agree on the shape. `id` is optional (present when editing an existing
 * custom prompt); the server assigns a `custom-` id on create.
 */
export const CustomPromptInput = z.object({
  id: z.string().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(80),
  category: PromptCategoryEnum,
  summary: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(24)).max(10).default([]),
  recommendedModel: TargetModelEnum.default('any'),
  body: z.string().trim().min(1).max(8000),
  dispatchable: z.boolean().default(true),
});
export type CustomPromptInputT = z.infer<typeof CustomPromptInput>;
