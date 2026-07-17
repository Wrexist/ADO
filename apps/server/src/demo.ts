/**
 * --demo seed: publishes fixture-shaped events so the full pipeline (validate →
 * persist → fold → SSE → slices) runs before real sources exist (real sources
 * land in 2.2–2.4/3/4). Deterministic and idempotent: stable ids + frozen fixture
 * clock; re-running changes nothing. This is the seed the P3.5 baselines render.
 */
import type { AutoReview } from '@ado/shared';
import { MOCK_NOW, MOCK_VIEW_A, MOCK_VIEW_B } from '@ado/shared/mock';
import type { Bus } from './bus';

const SRC = { kind: 'demo', ref: 'seed:v1' } as const;

export function seedDemo(bus: Bus): void {
  const pub = (id: string, type: string, ts: string, payload: unknown) =>
    bus.publish({ id: `demo:${id}`, type, ts, source: SRC, payload });

  // repos — View A cards enriched with View B table fields where ids match
  const byId = new Map(MOCK_VIEW_B.projects.map((p) => [p.id, p]));
  // Map a repo's display name → id so demo activity/deployments/builds carry the repo id.
  const nameToId = new Map(MOCK_VIEW_A.repos.map((r) => [r.name, r.id]));
  // Map the fixture's role-style agent ids to real seeded agent ids so the per-project
  // "Agents" panel resolves to full records (the runner sets real ids in production).
  const AGENT_MAP: Record<string, string> = { builder: 'game-builder', reviewer: 'code-review', tester: 'test-agent', deployer: 'docs-agent' };
  for (const r of MOCK_VIEW_A.repos) {
    const b = byId.get(r.id);
    pub(`repo:${r.id}`, 'repo.upserted', r.updatedTs, {
      repo: {
        id: r.id,
        name: r.name,
        category: r.category,
        status: r.status,
        description: r.description,
        branch: r.branch,
        updatedTs: r.updatedTs,
        language: b?.language,
        stars: b?.stars,
        prs: b?.prs,
        ci: { label: r.progress.label, pct: r.progress.pct, state: r.progress.state },
        agents: (r.agents ?? []).map((a) => AGENT_MAP[a] ?? a),
      },
    });
  }

  // builds
  for (const q of MOCK_VIEW_B.buildQueue) {
    pub(`build:${q.id}`, 'build.updated', MOCK_NOW, {
      build: {
        id: q.id,
        repo: nameToId.get(q.repo) ?? q.repo,
        jobLabel: q.jobLabel,
        branch: q.branch,
        state: q.state,
        startedTs: null,
        elapsedSec: q.elapsedSec,
      },
    });
  }

  // deployments
  for (const d of MOCK_VIEW_B.deployments) {
    pub(`deploy:${d.id}`, 'deploy.recorded', d.ts, {
      deployment: { id: d.id, name: d.name, env: d.env, ts: d.ts, ok: d.ok, repoId: nameToId.get(d.name) },
    });
  }

  // agents — running strip (runners) + configured roster
  for (const a of MOCK_VIEW_A.runningAgents) {
    pub(`agent:${a.id}`, 'agent.upserted', MOCK_NOW, {
      agent: {
        id: a.id,
        name: a.name,
        icon: a.icon,
        tone: a.tone,
        kind: 'runner',
        status: 'running',
        statusLine: a.statusLine,
        pct: a.pct,
      },
    });
  }
  const ROSTER_LOOK: Record<string, { icon: string; tone: string }> = {
    'code-review': { icon: 'code', tone: 'violet' },
    'bug-finder': { icon: 'search', tone: 'success' },
    performance: { icon: 'health', tone: 'warning' },
    security: { icon: 'lock', tone: 'info' },
  };
  for (const a of MOCK_VIEW_B.agentRoster) {
    const look = ROSTER_LOOK[a.id] ?? { icon: 'agents', tone: 'violet' };
    pub(`agent:${a.id}`, 'agent.upserted', MOCK_NOW, {
      agent: {
        id: a.id,
        name: a.name,
        icon: look.icon,
        tone: look.tone,
        kind: 'configured',
        status: a.state,
        statusLine: a.statusLine,
        pct: null,
      },
    });
  }

  // activity — one feed; both views project from it
  for (const it of [...MOCK_VIEW_A.activity, ...MOCK_VIEW_B.activity]) {
    pub(`activity:${it.id}`, 'activity.appended', it.ts, {
      item: { id: it.id, icon: it.icon, tone: it.tone, title: it.title, detail: it.detail, ts: it.ts, repoId: nameToId.get(it.title) },
    });
  }

  // health — all operational in the demo world
  for (const svc of ['github', 'anthropic', 'server', 'runner'] as const) {
    pub(`health:${svc}`, 'health.checked', MOCK_NOW, { service: svc, state: 'operational' });
  }

  // sysmon samples — zip the three fixture series into joint samples, 10s apart.
  // Samples live in the dedicated table, not the event log (pushSample, not publish).
  const [cpu, mem, net] = MOCK_VIEW_B.monitor;
  const n = Math.min(cpu.points.length, mem.points.length, net.points.length);
  const t0 = new Date(MOCK_NOW).getTime() - (n - 1) * 10_000;
  for (let i = 0; i < n; i++) {
    bus.pushSample(
      cpu.points[i],
      mem.points[i],
      net.points[i],
      new Date(t0 + i * 10_000).toISOString(),
    );
  }

  // tokens — demo rollup (real parsing lands in Phase 4 behind the adapter)
  pub('tokens:rollup', 'tokens.rollup', MOCK_NOW, {
    approxTokens: 2_400_000,
    windowLabel: '7 days',
  });

  // incidents → the self-diagnosis feed. Two diagnosed examples so /diagnostics is
  // self-documenting in the demo world (real mode captures these live when things break):
  // one AI-diagnosed server fault, one heuristic-diagnosed web crash. Reported then diagnosed,
  // exactly as the runtime does it.
  const incTs = (minAgo: number) => new Date(new Date(MOCK_NOW).getTime() - minAgo * 60_000).toISOString();
  const seedIncident = (
    inc: { id: string; source: 'server' | 'web' | 'runner'; kind: string; message: string; context?: string; stack?: string; minAgo: number },
    dx: { summary: string; rootCause: string; severity: 'low' | 'medium' | 'high' | 'critical'; suggestedFix: string; prevention: string; confidence: number; diagnosedBy: 'claude' | 'heuristic' },
  ) => {
    const ts = incTs(inc.minAgo);
    pub(`incident:${inc.id}`, 'incident.reported', ts, {
      incident: { id: inc.id, ts, source: inc.source, kind: inc.kind, message: inc.message, context: inc.context, stack: inc.stack, status: 'open' },
    });
    pub(`incident-dx:${inc.id}`, 'incident.diagnosed', incTs(inc.minAgo - 0.2), { incidentId: inc.id, diagnosis: dx });
  };
  seedIncident(
    { id: 'demo-inc-1', source: 'server', kind: 'route-error', minAgo: 12, context: 'GET /api/command', message: "TypeError: Cannot read properties of undefined (reading 'pct')", stack: "at respond (command/execute.ts:64)\nat POST /api/command" },
    {
      summary: 'A command targeted a repo that has no CI data yet.',
      rootCause: 'The command handler read repo.ci.pct without guarding the case where a scanned repo has never run CI, so ci is undefined.',
      severity: 'high',
      suggestedFix: 'Guard the access with optional chaining (repo.ci?.pct) and render the honest “no CI” state when it is absent.',
      prevention: 'Keep ci optional in the Repo contract (it already is) and never assume enrichment fields exist at read sites.',
      confidence: 0.86,
      diagnosedBy: 'claude',
    },
  );
  seedIncident(
    { id: 'demo-inc-2', source: 'web', kind: 'react-render', minAgo: 40, context: '/ops · in ActivityFeedB', message: "Cannot read properties of null (reading 'map')" },
    {
      summary: 'A feed component mapped over a value that was null.',
      rootCause: 'Code accessed a property/method on a value that was undefined or null — a shape assumption that did not hold at runtime.',
      severity: 'medium',
      suggestedFix: 'Add a null/undefined guard (optional chaining, a default, or an early return) at the access site the stack points to.',
      prevention: 'Parse external/boundary data with zod so a wrong shape fails loudly at the edge, not deep in a component.',
      confidence: 0.45,
      diagnosedBy: 'heuristic',
    },
  );

  // auto-reviews → the /reviews feed. Two finished examples (one with findings, one clean)
  // so the page is self-documenting in the demo world; real mode only ever shows reviews the
  // real model produced. Reported exactly as the engine publishes them (upsert by id).
  const rvTs = (minAgo: number) => new Date(new Date(MOCK_NOW).getTime() - minAgo * 60_000).toISOString();
  // Typed against the shared contract (conv. 2); generated metadata is applied AFTER the
  // spread so a seed can never override ts/model/status (trigger may vary per example).
  type SeededReview = Omit<AutoReview, 'ts' | 'model' | 'status' | 'trigger'> & { trigger?: AutoReview['trigger'] };
  const seedReview = ({ trigger, ...review }: SeededReview, minAgo: number) =>
    pub(`autoreview:${review.id}:done`, 'autoreview.updated', rvTs(minAgo), {
      review: { ...review, trigger: trigger ?? 'commit', ts: rvTs(minAgo), model: 'claude-opus-4-8', status: 'done' } satisfies AutoReview,
    });
  seedReview(
    {
      id: 'demo-rv-1',
      repoId: 'sentinel',
      ref: '9c41b7d2f3a8e6905b1c4d7e8f2a3b4c5d6e7f80',
      refLabel: '9c41b7d · wave spawner: scale difficulty per sector',
      verdict: 'attention',
      summary:
        'Adds per-sector difficulty scaling to the wave spawner. The scaling math is sound, but the sector index can go one past the config table and the new branch has no test.',
      stats: { files: 3, additions: 84, deletions: 12 },
      findings: [
        {
          severity: 'major',
          category: 'correctness',
          file: 'src/game/waves.ts',
          line: 118,
          title: 'Sector index can exceed the difficulty table',
          detail: 'sectorFor() clamps to MAX_SECTOR, but the new lookup uses sector + 1 for the "next sector preview", which reads past the table on the last sector and yields undefined scaling.',
          suggestion: 'Clamp the preview index too: DIFFICULTY[Math.min(sector + 1, MAX_SECTOR)] — and return the current sector’s row as the honest fallback.',
        },
        {
          severity: 'minor',
          category: 'testing',
          file: 'src/game/waves.test.ts',
          line: undefined,
          title: 'No test for the last-sector boundary',
          detail: 'The new scaling branch is untested exactly at the boundary where it can break (final sector).',
          suggestion: 'Add a case asserting the preview scaling at MAX_SECTOR equals the final row instead of undefined.',
        },
      ],
    },
    18,
  );
  seedReview(
    {
      id: 'demo-rv-2',
      repoId: 'atlas',
      trigger: 'manual',
      ref: 'working-tree',
      refLabel: 'uncommitted changes on main',
      verdict: 'clean',
      summary: 'Copy edits and a token-only color tweak on the landing page. No behavior change; nothing to flag.',
      stats: { files: 2, additions: 9, deletions: 7 },
      findings: [],
    },
    95,
  );

  // stat history → the "↑N this week" deltas render in the baseline world (real mode
  // accrues these live via the daily stats-snapshot job). One point per day for a week;
  // oldest-in-window is the delta baseline, so repos read +2 and deployments +1 vs today.
  const repoCount = MOCK_VIEW_A.repos.length;
  const deployCount = MOCK_VIEW_B.deployments.length;
  const agentSeries = [3, 4, 3, 5, 4, 6, 5]; // day-7 … day-1, feeds the View B agents sparkline
  // trailing-7d run-token sums (illustrative, per council B1) — ends near the seeded runs' total
  const tokensRunsSeries = [88_400, 104_100, 121_700, 139_200, 158_600, 176_900, 191_300];
  for (let d = 7; d >= 1; d--) {
    const day = new Date(new Date(MOCK_NOW).getTime() - d * 86_400_000).toISOString().slice(0, 10);
    pub(`stats:${day}`, 'stats.snapshot', `${day}T12:00:00.000Z`, {
      day,
      values: {
        repos: repoCount - (d >= 4 ? 2 : 1),
        deployments: deployCount - (d >= 4 ? 1 : 0),
        agentsActive: agentSeries[7 - d],
        tokensRuns: tokensRunsSeries[7 - d],
      },
    });
  }
}
