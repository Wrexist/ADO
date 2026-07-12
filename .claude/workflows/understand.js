export const meta = {
  name: 'understand',
  description: 'Build a cited, structured map of how a subsystem or feature actually works, by reading it in parallel through several lenses and synthesising one answer.',
  whenToUse: 'Before changing unfamiliar code, or to answer "how does X work / where does Y live". Args: {question?: string, paths?: string[]} to focus the readers; omit for a whole-repo orientation.',
  phases: [
    { title: 'Read', detail: 'parallel readers, one per subsystem/lens' },
    { title: 'Synthesise', detail: 'merge into one cited map' },
  ],
};

// This repo has stable seams; each reader owns one so they don't re-read the same files.
// A focused {paths}/{question} narrows every reader instead of adding more.
const LENSES = [
  { key: 'server', prompt: 'apps/server — Fastify app wiring, routes and their auth (X-ACC-Token / host-header allow-list), the SQLite/drizzle schema + migrations, the event bus (reduce/compact), integrations (github/sysmon/health), scanner, runner (claude -p spawn + slot accounting), scheduler, backup. Map the request/event lifecycle end to end.' },
  { key: 'web', prompt: 'apps/web — routes and the page for each, the Zustand store slices, how the SSE client folds events into state, the kit components + design tokens, the command palette. Map data flow from bus event → selector → rendered widget.' },
  { key: 'shared', prompt: 'packages/shared — the zod event contracts and the single reduce() that folds them into BusState, design tokens, the prompt library/catalogs, connectors. This is the contract both ends speak; map the event types and the state shape.' },
  { key: 'harness', prompt: 'The operating harness — CLAUDE.md conventions, .claude/ops.yml gates/thresholds, .claude/settings.json permissions + hooks, skills, the verifier agent, run.sh/install.sh. Map how a change is meant to be built, gated and verified here.' },
];

const MAP = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '3-6 sentences: what this subsystem is and does' },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          file: { type: 'string', description: 'path:line of the definition' },
          role: { type: 'string' },
        },
        required: ['name', 'file', 'role'],
        additionalProperties: false,
      },
    },
    dataFlow: { type: 'array', items: { type: 'string' }, description: 'ordered steps, each citing a file' },
    entryPoints: { type: 'array', items: { type: 'string' } },
    gotchas: { type: 'array', items: { type: 'string' }, description: 'non-obvious invariants, footguns, conventions a change must respect' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'components', 'dataFlow'],
  additionalProperties: false,
};

const focus = args && args.question ? `Focus on this question: "${args.question}".` : 'Give a complete orientation of your area.';
const paths = args && args.paths && args.paths.length ? `Prioritise these paths: ${args.paths.join(', ')}.` : '';

phase('Read');
const maps = await parallel(
  LENSES.map((l) => () =>
    agent(
      `You are mapping the "${l.key}" area of the ai-control-center repo for an engineer about to work in it.\n` +
        `Area: ${l.prompt}\n${focus} ${paths}\n` +
        `READ the real files — every claim must cite an actual path (and line where you can). Do not invent structure you did not open. Note real invariants and footguns, not generic advice.`,
      { label: `read:${l.key}`, phase: 'Read', schema: MAP, effort: 'high' },
    ).catch(() => null),
  ),
);

const found = LENSES.map((l, i) => ({ area: l.key, map: maps[i] })).filter((x) => x.map);
if (!found.length) {
  log('understand: no readers returned — nothing to synthesise');
  return { map: null, areas: [] };
}

phase('Synthesise');
const synthesis = await agent(
  `You are the lead engineer. Below are ${found.length} structured maps of separate areas of the ai-control-center repo, each with cited files. ` +
    `Merge them into ONE coherent orientation for someone about to make a change` +
    (args && args.question ? ` that answers: "${args.question}"` : '') +
    `. Keep every file citation. Draw the cross-area data flow (event emitted in server → contract in shared → rendered in web). Call out the invariants a change must not break (no-fabrication, typed-events-only, token-gated mutations). End with the concrete files someone would touch first.\n\n` +
    found.map((x) => `### ${x.area}\n${JSON.stringify(x.map, null, 2)}`).join('\n\n'),
  { label: 'synthesise', phase: 'Synthesise', effort: 'high' },
);

log(`understand: mapped ${found.length} area(s)`);
return { map: synthesis, areas: found };
