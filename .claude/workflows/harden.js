export const meta = {
  name: 'harden',
  description: 'Exhaustive bug hunt: keep spawning finders until several rounds turn up nothing new, verify each fresh bug from three independent angles, and return only those a majority confirm.',
  whenToUse: 'When you want depth over speed on a target — "find every bug here", pre-release hardening. Args: {target?: string, paths?: string[], dryRounds?: number}. Respects a +budget directive; otherwise stops after the dry-round streak.',
  phases: [
    { title: 'Hunt', detail: 'rounds of finders until dry' },
    { title: 'Verify', detail: 'three-lens majority vote per fresh bug' },
  ],
};

const target = (args && args.target) || 'the ai-control-center repo';
const paths = args && args.paths && args.paths.length ? ` Concentrate on: ${args.paths.join(', ')}.` : '';
const DRY_TARGET = (args && args.dryRounds) || 2; // consecutive empty rounds that end the hunt
const MAX_ROUNDS = 8; // hard backstop so a pathological run can't spin

// Each round runs these angles in parallel; giving finders different vantage points surfaces
// bugs a single "find bugs" prompt misses. New rounds are told what's already been found.
const ANGLES = [
  'concurrency & lifecycle: races, await ordering, unbalanced semaphore/slot counters, leaked handles/subprocesses, listeners never removed, unhandled promise rejections',
  'data integrity & the no-fabrication rule: values rendered without a real source event, dedup-by-stable-id dropping live updates, reducer cases that drop or double-count, unbounded growth without eviction, migrations that lose data',
  'security & trust boundaries: an unauthenticated mutating path, a secret reaching logs or the client, host-header/CORS gaps, external text used as instructions, an over-broad env handed to a spawned agent',
  'error & edge paths: inputs that throw, empty/malformed events, boundary values, degraded-mode handling of an unstable interface (claude -p stream-json, SSE reconnect, session-log parse)',
];

const BUGS = {
  type: 'object',
  properties: {
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          repro: { type: 'string', description: 'concrete inputs/state → wrong behaviour' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'repro'],
        additionalProperties: false,
      },
    },
  },
  required: ['bugs'],
  additionalProperties: false,
};

const VERDICT = {
  type: 'object',
  properties: { real: { type: 'boolean' }, reason: { type: 'string' } },
  required: ['real', 'reason'],
  additionalProperties: false,
};

const SEV = { critical: 0, high: 1, medium: 2, low: 3 };
const key = (b) => `${(b.file || '').trim()}::${(b.title || '').trim().toLowerCase()}`;
const LENSES = ['does-it-actually-reproduce', 'is-the-cited-code-really-like-that', 'is-it-in-scope-and-not-pre-existing-by-design'];

const seen = new Set();
const confirmed = [];
let dry = 0;
let round = 0;

while (dry < DRY_TARGET && round < MAX_ROUNDS) {
  if (budget.total && budget.remaining() < 60000) {
    log(`harden: stopping — ~${Math.round(budget.remaining() / 1000)}k budget left`);
    break;
  }
  round += 1;
  phase('Hunt');
  const already = confirmed.length
    ? `\nAlready found (do NOT re-report these; find DIFFERENT bugs):\n${confirmed.map((b) => `- ${b.file}: ${b.title}`).join('\n')}`
    : '';
  const rounds = await parallel(
    ANGLES.map((angle, i) => () =>
      agent(
        `Bug hunt (round ${round}) on ${target}, angle: ${angle}.${paths}\n` +
          `Read the real code and report only genuine, reproducible defects with a concrete repro. Not style, not speculation, not pre-existing intentional behaviour.${already}`,
        { label: `hunt:r${round}:a${i + 1}`, phase: 'Hunt', schema: BUGS, effort: 'high' },
      ).catch(() => null),
    ),
  );

  const fresh = rounds
    .filter(Boolean)
    .flatMap((r) => (r && r.bugs ? r.bugs : []))
    .filter((b) => {
      const k = key(b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  if (!fresh.length) {
    dry += 1;
    log(`harden: round ${round} dry (${dry}/${DRY_TARGET})`);
    continue;
  }
  dry = 0;

  phase('Verify');
  const judged = await parallel(
    fresh.map((b) => () =>
      parallel(
        LENSES.map((lens) => () =>
          agent(
            `Verify a reported bug through ONE lens: ${lens}. Read the real code and try to REFUTE it. Answer real:true only if it holds up under this lens; default real:false when unsure.\n` +
              `Title: ${b.title}\nFile: ${b.file}:${b.line || '?'}\nRepro: ${b.repro}`,
            { label: `verify:${lens.split('-')[0]}:${b.file}`, phase: 'Verify', schema: VERDICT, effort: 'high' },
          ).catch(() => null),
        ),
      ).then((votes) => {
        const yes = votes.filter((v) => v && v.real).length;
        return yes >= 2 ? { ...b, votes: yes } : null; // majority of 3
      }),
    ),
  );

  const kept = judged.filter(Boolean);
  confirmed.push(...kept);
  log(`harden: round ${round} — ${fresh.length} fresh, ${kept.length} confirmed (total ${confirmed.length})`);
}

confirmed.sort((a, b) => (SEV[a.severity] ?? 4) - (SEV[b.severity] ?? 4));
log(`harden: ${confirmed.length} confirmed bug(s) over ${round} round(s)`);
return { bugs: confirmed, rounds: round, stoppedDry: dry >= DRY_TARGET };
