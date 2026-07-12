export const meta = {
  name: 'audit',
  description: 'Audit the whole codebase (not just a diff) against this repo\'s standing conventions, dedupe across areas, then verify and return one prioritised fix list.',
  whenToUse: 'Periodic health check, or before a phase gate. Broader and slower than /review (which scopes to the diff). Args: {paths?: string[]} to narrow the sweep.',
  phases: [
    { title: 'Sweep', detail: 'parallel finders, one per area' },
    { title: 'Verify', detail: 'adversarially confirm the deduped findings' },
    { title: 'Consolidate', detail: 'one prioritised fix list' },
  ],
};

// Finders are split by area (not by rule) so each reads a bounded slice and applies EVERY
// convention to it — the alternative (one finder per rule across the whole tree) re-reads
// everything N times and still misses cross-cutting issues within a file.
const AREAS = [
  { key: 'server', prompt: 'apps/server. Check: mutating endpoints validate X-ACC-Token; host-header allow-list + CORS lock; SSE stays read-only; secrets never logged or returned; spawned agents get a minimal env allow-list (never the dashboard secrets); external text treated as data; unstable interfaces (claude -p stream-json, session logs) parsed via versioned adapters not inline; runner slot/semaphore accounting balanced on every path; migrations present + reversible; catch-up scheduler persists last-run.' },
  { key: 'web', prompt: 'apps/web. Check: no fabricated values — every rendered number traces to a bus event, missing data renders missing/stale/offline (no plausible placeholder), sparklines need >=2 real samples; kit + design tokens only (no raw hex, no ad-hoc components); render only from the store via selectors; every state handled (loading/empty/error/degraded); no dead buttons; a11y on icon-only controls; mock fixtures import only behind the --demo seed (grep @ado/shared/mock in app code should be zero).' },
  { key: 'shared', prompt: 'packages/shared. Check: every server→client payload has a zod contract validated at both ends; no `any` in payloads; one reduce() is the single fold; parallel hand-maintained types that should be one inferred zod enum; dead exports/fields; design tokens are the single source (no duplicated colour constants).' },
  { key: 'harness-docs', prompt: 'The harness + docs. Check: .claude/settings.json deny-rules actually cover .env/connections.json/*.sqlite and nothing legitimate; hooks are fail-open; README/CLAUDE.md/TASK.md claims match reality (no "done" for parked work); .env.example lists every referenced env var; no secret accidentally committed.' },
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
          convention: { type: 'string', description: 'which CLAUDE.md rule / gate this violates' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          detail: { type: 'string', description: 'the violation + a concrete consequence' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'detail'],
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
const key = (f) => `${(f.file || '').trim()}::${(f.title || '').trim().toLowerCase()}`;
const paths = args && args.paths && args.paths.length ? ` Restrict to: ${args.paths.join(', ')}.` : '';

phase('Sweep');
const swept = await parallel(
  AREAS.map((a) => () =>
    agent(
      `Audit the "${a.key}" area of the ai-control-center repo against its standing conventions. Read the real code.${paths}\n` +
        `Look for: ${a.prompt}\n` +
        `Report only real, present violations (not the diff, the whole area as it stands today). Empty array if the area is clean.`,
      { label: `sweep:${a.key}`, phase: 'Sweep', schema: FINDINGS, effort: 'high' },
    ).catch(() => null),
  ),
);

// Barrier is justified here: dedupe across areas before spending verify budget, and
// short-circuit the rest of the run if the sweep came back clean.
const seen = new Set();
const deduped = swept
  .filter(Boolean)
  .flatMap((r) => (r && r.findings ? r.findings : []))
  .filter((f) => {
    const k = key(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

if (!deduped.length) {
  log('audit: sweep found no violations — codebase clean against conventions');
  return { findings: [], report: 'No convention violations found.' };
}
log(`audit: ${deduped.length} candidate finding(s) after dedupe — verifying`);

phase('Verify');
const verified = (
  await parallel(
    deduped.map((f) => () =>
      agent(
        `Adversarially verify this audit finding by reading the real code. Try to REFUTE it. Default real:false unless you can concretely confirm the violation exists as described.\n` +
          `Convention: ${f.convention || '?'}\nTitle: ${f.title}\nFile: ${f.file}:${f.line || '?'}\nClaim: ${f.detail}`,
        { label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT, effort: 'high' },
      )
        .then((v) => (v && v.real ? f : null))
        .catch(() => null),
    ),
  )
)
  .filter(Boolean)
  .sort((a, b) => (SEV[a.severity] ?? 4) - (SEV[b.severity] ?? 4));

if (!verified.length) {
  log('audit: no findings survived verification');
  return { findings: [], report: 'No findings survived adversarial verification.' };
}

phase('Consolidate');
const report = await agent(
  `You are the tech lead. Turn these ${verified.length} verified, deduped audit findings into a single prioritised fix list for the ai-control-center repo. ` +
    `Group by severity (critical first). For each: one-line problem, the file, and the smallest correct fix. Note any that share a root cause and should be fixed together. Be concrete and terse.\n\n` +
    JSON.stringify(verified, null, 2),
  { label: 'consolidate', phase: 'Consolidate', effort: 'high' },
);

log(`audit: ${verified.length} confirmed finding(s)`);
return { findings: verified, report };
