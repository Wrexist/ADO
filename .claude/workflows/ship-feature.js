export const meta = {
  name: 'ship-feature',
  description: 'Turn a feature request into a vetted, buildable plan: map the affected code, generate several independent designs, score them with a judge panel, then synthesise one plan checked against this repo\'s conventions. Planning only — writes no code.',
  whenToUse: 'At the start of a non-trivial feature, before writing code. Args: {request: "what to build"} (required), {paths?: string[]} to hint the area.',
  phases: [
    { title: 'Understand', detail: 'parallel readers map the affected area' },
    { title: 'Design', detail: 'independent proposals from different angles' },
    { title: 'Judge', detail: 'score every proposal in parallel' },
    { title: 'Plan', detail: 'synthesise one vetted plan' },
  ],
};

const request = (args && args.request) || (typeof args === 'string' ? args : null);
if (!request) {
  log('ship-feature: no request given — pass {request: "..."}');
  return { error: 'ship-feature requires args.request' };
}
const paths = args && args.paths && args.paths.length ? ` The relevant area is likely: ${args.paths.join(', ')}.` : '';

// Read the seams a feature usually crosses so the design is grounded in the real contracts.
const READERS = [
  { key: 'contracts', prompt: 'packages/shared: the zod event contracts, the single reduce() into BusState, tokens/catalogs. What events + state shape exist, and what a new feature would add or extend.' },
  { key: 'server', prompt: 'apps/server: routes + auth, the bus (emit/reduce/compact), integrations/scanner/runner/scheduler, migrations. Where new data would be produced and persisted.' },
  { key: 'web', prompt: 'apps/web: routes, store slices, SSE→selector→widget flow, kit + tokens, command palette. Where a new feature would surface and how it would render honestly (every state).' },
];

const MAP = {
  type: 'object',
  properties: {
    relevant: { type: 'array', items: { type: 'string' }, description: 'files a change would touch, cited' },
    contracts: { type: 'array', items: { type: 'string' }, description: 'existing events/types to extend or add' },
    constraints: { type: 'array', items: { type: 'string' }, description: 'conventions/invariants this feature must respect' },
    notes: { type: 'string' },
  },
  required: ['relevant', 'notes'],
  additionalProperties: false,
};

const DESIGN = {
  type: 'object',
  properties: {
    approach: { type: 'string', description: 'the design in 4-8 sentences' },
    events: { type: 'array', items: { type: 'string' }, description: 'new/changed zod contracts' },
    server: { type: 'array', items: { type: 'string' }, description: 'server-side steps' },
    web: { type: 'array', items: { type: 'string' }, description: 'web-side steps' },
    risks: { type: 'array', items: { type: 'string' } },
    effort: { type: 'string', enum: ['S', 'M', 'L'] },
  },
  required: ['approach', 'server', 'web', 'risks', 'effort'],
  additionalProperties: false,
};

const SCORE = {
  type: 'object',
  properties: {
    fitsConventions: { type: 'integer', description: '0-10: honesty rule, typed events, tokens, security' },
    simplicity: { type: 'integer', description: '0-10' },
    completeness: { type: 'integer', description: '0-10: covers all states + failure paths' },
    total: { type: 'integer', description: '0-30' },
    verdict: { type: 'string' },
  },
  required: ['fitsConventions', 'simplicity', 'completeness', 'total', 'verdict'],
  additionalProperties: false,
};

// Distinct starting biases so the panel explores a wide solution space, not three variants of one idea.
const ANGLES = [
  { key: 'minimal', bias: 'Smallest correct change. Reuse existing events/components; add the least new surface area. Bias to shipping thin.' },
  { key: 'convention-first', bias: 'The most CLAUDE.md-idiomatic design even if larger: one zod contract as source of truth, event-sourced, honest empty/stale states, token-gated mutations. Bias to fitting the architecture perfectly.' },
  { key: 'robust', bias: 'The most resilient design: degraded states, catch-up on restart, no unbounded growth, adversarial-input safe. Bias to what survives a week of real use.' },
];

phase('Understand');
const maps = await parallel(
  READERS.map((r) => () =>
    agent(
      `A feature is planned for the ai-control-center repo: "${request}".${paths}\n` +
        `Read the "${r.key}" area (${r.prompt}) and report, with real citations, what this feature would touch there. Do not design yet — just map the ground truth.`,
      { label: `read:${r.key}`, phase: 'Understand', schema: MAP, effort: 'high' },
    ).catch(() => null),
  ),
);
const ground = maps.map((m, i) => (m ? `### ${READERS[i].key}\n${JSON.stringify(m, null, 2)}` : null)).filter(Boolean).join('\n\n');

phase('Design');
const context = `Feature: "${request}"\n\nGround truth from reading the repo:\n${ground}`;
const designs = (
  await parallel(
    ANGLES.map((a) => () =>
      agent(
        `${context}\n\nDesign this feature for the ai-control-center repo with this bias: ${a.bias}\n` +
          `Ground every step in the real files above. Respect: no fabricated values, typed zod events validated both ends, design tokens + kit only, mutations token-gated. Be concrete about which events and files change.`,
        { label: `design:${a.key}`, phase: 'Design', schema: DESIGN, effort: 'high' },
      )
        .then((d) => (d ? { angle: a.key, design: d } : null))
        .catch(() => null),
    ),
  )
).filter(Boolean);

if (!designs.length) {
  log('ship-feature: no design proposals produced');
  return { error: 'no designs', ground };
}

phase('Judge');
const scored = await parallel(
  designs.map((d) => () =>
    agent(
      `Score this design proposal for the ai-control-center repo strictly. Feature: "${request}".\n` +
        `Judge only on fit-to-conventions, simplicity, and completeness (all states + failure paths). Be a hard grader.\n\n${JSON.stringify(d.design, null, 2)}`,
      { label: `judge:${d.angle}`, phase: 'Judge', schema: SCORE, effort: 'high' },
    )
      .then((s) => ({ ...d, score: s }))
      .catch(() => ({ ...d, score: null })),
  ),
);

const ranked = scored
  .filter((d) => d.score)
  .sort((a, b) => (b.score.total || 0) - (a.score.total || 0));
const winner = ranked[0] || scored[0];

phase('Plan');
const plan = await agent(
  `You are the tech lead writing the final, buildable plan for "${request}" in the ai-control-center repo.\n` +
    `The panel's top design (${winner.angle}, score ${winner.score ? winner.score.total : '?'}/30) is the base. Graft the best ideas from the runners-up where they strengthen it.\n\n` +
    `Ground truth:\n${ground}\n\nRanked designs:\n${JSON.stringify(ranked.map((d) => ({ angle: d.angle, score: d.score, design: d.design })), null, 2)}\n\n` +
    `Produce: (1) the chosen approach in a paragraph; (2) the exact zod contract additions/changes; (3) an ordered, checkable task list separated into shared → server → web, each task naming the file; (4) how each rendered value stays honest (source event + empty/stale state); (5) the tests that prove it; (6) risks + how the plan mitigates them. This must be precise enough to implement directly.`,
  { label: 'plan', phase: 'Plan', effort: 'high' },
);

log(`ship-feature: planned "${request}" — winning angle: ${winner.angle}`);
return { plan, winner: winner.angle, ranked: ranked.map((d) => ({ angle: d.angle, score: d.score })), ground };
