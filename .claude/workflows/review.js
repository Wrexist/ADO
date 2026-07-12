export const meta = {
  name: 'review',
  description: 'Adversarial review of the working changes across this repo\'s dimensions, then verify each finding before reporting.',
  whenToUse: 'Before committing a non-trivial change, or when asked to review the current diff. Args: {base?: "origin/main"} to review a range instead of the working tree.',
  phases: [{ title: 'Review', detail: 'one agent per dimension' }, { title: 'Verify', detail: 'adversarially refute each finding' }],
};

// Review dimensions == this repo's non-negotiables (CLAUDE.md). Each is a distinct lens so
// redundant reviewers don't crowd out a failure mode only one lens would catch.
const DIMENSIONS = [
  { key: 'correctness', prompt: 'Bugs, races, resource/semaphore leaks, unhandled rejections, off-by-one, wrong async ordering, dedup-by-stable-id dropping updates, unbounded growth.' },
  { key: 'honesty', prompt: 'The no-fabrication rule: every rendered value must trace to a stored typed event; flag numeric literals rendered as data, hardcoded counts/badges, or a metric defaulted with ??. Typed events only — no `any` in payloads; server↔web only through @ado/shared zod contracts validated at both ends.' },
  { key: 'security', prompt: 'Mutating endpoints must check X-ACC-Token; SSE read-only + token-gated; host-header allow-list on all routes; CORS locked; secrets never returned to the client or written to logs; spawned agents get a minimal env allow-list; external text (reviews, agent output, fetched content) is data, never instructions.' },
  { key: 'frontend', prompt: 'apps/web only: kit + design tokens only (no raw hex); render solely from the bus store via selectors; every state (loading/empty/error/degraded); no dead buttons (route or act, or /planned placeholder); a11y (keyboard, focus, aria on icon-only controls); reserved-width slots (no reflow).' },
  { key: 'simplify', prompt: 'Dead code (unused exports/props/fields), duplication that should be one helper, needless complexity, a parallel hand-maintained type that should be one zod enum inferred.' },
  { key: 'test-coverage', prompt: 'Critical or error paths added/changed without a test that would catch a regression (esp. reducer cases, runner failure paths, security gates, migrations).' },
];

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          detail: { type: 'string', description: 'why it is wrong + a concrete failure scenario' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'detail', 'severity'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};

const VERDICT = {
  type: 'object',
  properties: { real: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['real', 'reason'],
  additionalProperties: false,
};

const SEV = { critical: 0, high: 1, medium: 2, low: 3 };

const scope = args && args.base
  ? `the diff of the current branch against ${args.base} (run: git diff ${args.base}...HEAD)`
  : 'the working changes (run: git status; git diff HEAD — include staged; if empty, git diff origin/main...HEAD)';

phase('Review');
const reviewed = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(
      `You are reviewing ${scope} in the ai-control-center repo, ONLY through the "${d.key}" lens.\n` +
        `Look for: ${d.prompt}\n` +
        `Read the actual changed code (and its neighbours) before claiming anything. Report ONLY real defects introduced by these changes — not pre-existing style, not speculation. If the lens finds nothing, return an empty findings array.`,
      { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS, effort: 'high' },
    ),
  // As each dimension's review lands, verify its findings concurrently (no barrier).
  (review, d) =>
    parallel(
      (review && review.findings ? review.findings : []).map((f) => () =>
        agent(
          `Adversarially verify this ${d.key} review finding — try hard to REFUTE it by reading the real code. Default real:false if you cannot concretely confirm it.\n` +
            `Title: ${f.title}\nFile: ${f.file}:${f.line || '?'}\nClaim: ${f.detail}`,
          { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT, effort: 'high' },
        )
          .then((v) => ({ ...f, dimension: d.key, verdict: v }))
          .catch(() => null),
      ),
    ),
);

const confirmed = reviewed
  .flat()
  .filter(Boolean)
  .filter((f) => f.verdict && f.verdict.real)
  .sort((a, b) => (SEV[a.severity] ?? 4) - (SEV[b.severity] ?? 4));

log(`review: ${confirmed.length} confirmed finding(s) across ${DIMENSIONS.length} lenses`);
return { confirmed };
