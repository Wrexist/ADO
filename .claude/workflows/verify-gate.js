export const meta = {
  name: 'verify-gate',
  description: 'The done-gate: run the mechanical gate (typecheck·lint·test·build, and the visual smoke) via the independent verifier, audit the change against the honesty/security conventions in parallel, then let a completeness critic find what the gate would miss. Returns a single pass/block verdict.',
  whenToUse: 'Before calling a change done or committing something non-trivial. Args: {base?: "origin/main"} to scope the convention audit to a diff; {smoke?: false} to skip the Playwright pass.',
  phases: [
    { title: 'Gate', detail: 'verifier agent runs verify (+smoke)' },
    { title: 'Audit', detail: 'convention checks in parallel' },
    { title: 'Critic', detail: 'what would the gate miss?' },
  ],
};

const scope = args && args.base
  ? `the diff of this branch vs ${args.base} (git diff ${args.base}...HEAD)`
  : 'the working changes (git status; git diff HEAD)';
const runSmoke = !(args && args.smoke === false);

const GATE = {
  type: 'object',
  properties: {
    verify: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    smoke: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    failures: { type: 'array', items: { type: 'string' }, description: 'exact failing steps + first error line' },
    notes: { type: 'string' },
  },
  required: ['verify', 'smoke', 'failures'],
  additionalProperties: false,
};

const AUDIT = {
  type: 'object',
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          file: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
        required: ['rule', 'file', 'detail', 'severity'],
        additionalProperties: false,
      },
    },
  },
  required: ['violations'],
  additionalProperties: false,
};

const CRITIC = {
  type: 'object',
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string', description: 'what is unverified, missing, or untested' },
          why: { type: 'string', description: 'why the mechanical gate would not catch it' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
        required: ['what', 'why', 'severity'],
        additionalProperties: false,
      },
    },
  },
  required: ['gaps'],
  additionalProperties: false,
};

// Convention lenses that a green build can still violate — these are the ones that matter here.
const LENSES = [
  { key: 'honesty', prompt: 'No fabricated values: every rendered number traces to a stored typed event; missing data renders missing/stale/offline; sparklines need >=2 real samples; no hand-maintained counts. Typed events only; no `any` in payloads; server↔web only via @ado/shared zod contracts validated both ends.' },
  { key: 'security', prompt: 'Mutating endpoints token-gated (X-ACC-Token); host-header allow-list + CORS lock; SSE read-only; no secret in logs or client responses; spawned agents get a minimal env allow-list; external text treated as data, not instructions.' },
  { key: 'coverage', prompt: 'Changed critical/error paths have a test that would catch a regression (reducer cases, runner failure paths, security gates, migrations). Docs/TASK.md claims match reality (nothing marked done that is parked).' },
];

const SEV = { critical: 0, high: 1, medium: 2, low: 3 };

phase('Gate');
const gate = await agent(
  `Run this repo's mechanical gate from the repo root and report results honestly (do not fix anything).\n` +
    `1) npm run verify (typecheck·lint·test·build).\n` +
    (runSmoke ? `2) npm run smoke (Playwright --demo visual gate). If it cannot run for lack of ACC_TOKEN/browser, mark smoke "skipped" and say why — do not call that a pass.\n` : `Smoke is intentionally skipped this run — mark smoke "skipped".\n`) +
    `Report the exact failing step and its first error line for anything that fails.`,
  { label: 'gate', phase: 'Gate', agentType: 'verifier', schema: GATE, effort: 'high' },
).catch((e) => ({ verify: 'fail', smoke: 'skipped', failures: [`verifier agent error: ${String(e)}`], notes: '' }));

// Convention audit + completeness critic don't depend on the gate result — run them regardless
// so one report covers everything (a green gate can still hide a convention or coverage gap).
phase('Audit');
const audits = await parallel(
  LENSES.map((l) => () =>
    agent(
      `Audit ${scope} in the ai-control-center repo through the "${l.key}" lens. Read the real changed code.\n` +
        `Check: ${l.prompt}\n` +
        `Report only real violations introduced or left by this change. Empty array if clean.`,
      { label: `audit:${l.key}`, phase: 'Audit', schema: AUDIT, effort: 'high' },
    ).catch(() => null),
  ),
);
const violations = audits
  .filter(Boolean)
  .flatMap((a) => (a && a.violations ? a.violations : []))
  .sort((a, b) => (SEV[a.severity] ?? 4) - (SEV[b.severity] ?? 4));

phase('Critic');
const critic = await agent(
  `You are the completeness critic for a change to the ai-control-center repo (${scope}). A green build proves little on its own.\n` +
    `Given the gate result and the convention audit below, name what is still unverified: a claim not backed by a test, a state (empty/error/degraded) not handled, a migration not exercised, an interface parsed without a versioned adapter, a doc claim not matching code, a value on screen without a traceable source. For each, say why the mechanical gate would not catch it.\n\n` +
    `Gate: ${JSON.stringify(gate)}\nAudit violations: ${JSON.stringify(violations)}`,
  { label: 'critic', phase: 'Critic', schema: CRITIC, effort: 'high' },
).catch(() => ({ gaps: [] }));

const blockers = [
  ...(gate.verify === 'fail' ? [{ source: 'gate', detail: `verify failed: ${(gate.failures || []).join('; ')}` }] : []),
  ...(gate.smoke === 'fail' ? [{ source: 'gate', detail: 'smoke failed' }] : []),
  ...violations.filter((v) => v.severity === 'critical' || v.severity === 'high').map((v) => ({ source: `audit:${v.rule}`, detail: `${v.file}: ${v.detail}` })),
  ...(critic.gaps || []).filter((g) => g.severity === 'critical' || g.severity === 'high').map((g) => ({ source: 'critic', detail: g.what })),
];

const pass = blockers.length === 0 && gate.verify === 'pass';
log(`verify-gate: ${pass ? 'PASS' : 'BLOCK'} — verify=${gate.verify} smoke=${gate.smoke}, ${violations.length} violation(s), ${(critic.gaps || []).length} gap(s), ${blockers.length} blocker(s)`);
return { pass, gate, violations, gaps: critic.gaps || [], blockers };
