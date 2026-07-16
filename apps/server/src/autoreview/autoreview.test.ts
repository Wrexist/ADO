import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AutoReview } from '@ado/shared';
import { openDb } from '../db';
import { Bus } from '../bus';
import type { AccServer } from '../app';
import { buildServer } from '../app';
import type { SpawnHandle, SpawnOpts, Spawner } from '../runner/spawner';
import { collectDiff, headSha, DIFF_CHAR_CAP } from './differ';
import { ClaudeReviewer, NoKeyError, type FetchFn } from './reviewer';
import { AutoReviewStore } from './store';
import { AutoReviewEngine, MIN_AUTO_INTERVAL_MS } from './engine';

// —— fixtures ————————————————————————————————————————————————————————————————

/** A real throwaway git repo (the differ is exercised against actual git, not a fake). */
function makeRepo(): { dir: string; commit: (msg: string) => void; write: (file: string, content: string) => void } {
  const dir = mkdtempSync(join(tmpdir(), 'acc-arv-'));
  const g = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 't@t']);
  g(['config', 'user.name', 't']);
  return {
    dir,
    write: (file, content) => {
      const full = join(dir, file);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    },
    commit: (msg) => {
      g(['add', '-A']);
      g(['commit', '-q', '-m', msg]);
    },
  };
}

type SentBody = {
  model: string;
  system: string;
  tools: Array<{ name: string; strict?: boolean }>;
  tool_choice: { type: string; name: string };
  messages: { role: string; content: string }[];
};
type Captured = { body: SentBody; headers: Record<string, string> };

function reviewFetch(input: Record<string, unknown>, ok = true, status = 200): { fetch: FetchFn; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(String(init.body)) as SentBody, headers: init.headers as Record<string, string> });
    return { ok, status, json: async () => ({ content: [{ type: 'tool_use', name: 'record_review', input }] }) } as Response;
  }) as unknown as FetchFn;
  return { fetch, calls };
}

const GOOD_REVIEW = {
  summary: 'Adds a wave spawner; one boundary bug.',
  verdict: 'attention',
  findings: [
    { severity: 'major', category: 'correctness', file: 'src/game.ts', line: 3, title: 'off-by-one', detail: 'boundary excluded', suggestion: 'use <=' },
  ],
};

// —— differ ——————————————————————————————————————————————————————————————————

describe('autoreview differ (read-only git facts)', () => {
  const temps: string[] = [];
  afterAll(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
  });

  it('errors honestly on a repo with no commits', async () => {
    const r = makeRepo();
    temps.push(r.dir);
    expect(await headSha(r.dir)).toBeNull();
    const out = await collectDiff(r.dir);
    expect('error' in out && out.error).toMatch(/no commits/);
  });

  it('clean tree → the last commit patch, with sha ref + subject label + numstat stats', async () => {
    const r = makeRepo();
    temps.push(r.dir);
    r.write('src/game.ts', 'export const waves = 3;\n');
    r.commit('add waves');
    const out = await collectDiff(r.dir);
    if ('error' in out) throw new Error(out.error);
    expect(out.ref).toMatch(/^[0-9a-f]{40}$/);
    expect(out.refLabel).toContain('add waves');
    expect(out.diff).toContain('src/game.ts');
    expect(out.stats.files).toBe(1);
    expect(out.stats.additions).toBe(1);
    expect(out.truncated).toBe(false);
  });

  it('dirty tree → reviews uncommitted changes vs HEAD (ref working-tree)', async () => {
    const r = makeRepo();
    temps.push(r.dir);
    r.write('a.ts', 'let x = 1;\n');
    r.commit('init');
    r.write('a.ts', 'let x = 2;\nlet y = 3;\n');
    const out = await collectDiff(r.dir);
    if ('error' in out) throw new Error(out.error);
    expect(out.ref).toBe('working-tree');
    expect(out.refLabel).toContain('uncommitted changes');
    expect(out.diff).toContain('+let y = 3;');
  });

  it('excludes lockfiles and caps huge diffs with an explicit truncation marker', async () => {
    const r = makeRepo();
    temps.push(r.dir);
    // both files are TRACKED (committed small), then modified — untracked files are never
    // in `git diff HEAD` and take the honest "nothing reviewable" path instead
    r.write('package-lock.json', '{}\n');
    r.write('big.ts', 'ok\n');
    r.commit('init');
    r.write('package-lock.json', `{"x":"${'y'.repeat(500)}"}\n`);
    r.write('big.ts', `${'// filler line that pads the diff well past the cap\n'.repeat(3000)}`);
    const out = await collectDiff(r.dir);
    if ('error' in out) throw new Error(out.error);
    expect(out.diff).not.toContain('package-lock.json'); // noise excluded
    expect(out.truncated).toBe(true);
    expect(out.diff.length).toBeLessThanOrEqual(DIFF_CHAR_CAP + 200);
    expect(out.diff).toContain('[diff truncated');
  });
});

// —— reviewer ————————————————————————————————————————————————————————————————

const REQ = { repoName: 'sentinel', branch: 'main', refLabel: 'abc1234 · fix', truncated: false, diff: 'diff --git a/src/game.ts b/src/game.ts\n+for (let i = 0; i < waves; i++)' };

describe('ClaudeReviewer (structured, never fabricates)', () => {
  it('throws NoKeyError with no key — there is NO heuristic code review', async () => {
    const rv = new ClaudeReviewer(() => undefined, (async () => { throw new Error('must not call'); }) as unknown as FetchFn);
    expect(rv.hasKey()).toBe(false);
    await expect(rv.review(REQ)).rejects.toBeInstanceOf(NoKeyError);
  });

  it('reviews via a forced strict tool call on the top model, diff framed as data', async () => {
    const { fetch, calls } = reviewFetch(GOOD_REVIEW);
    const rv = new ClaudeReviewer(() => 'sk-test', fetch);
    const out = await rv.review(REQ);
    expect(out.verdict).toBe('attention');
    expect(out.findings).toHaveLength(1);
    expect(out.model).toBe('claude-opus-4-8');
    expect(calls[0].body.model).toBe('claude-opus-4-8');
    expect(calls[0].body.tool_choice).toEqual({ type: 'tool', name: 'record_review' });
    expect(calls[0].body.tools[0].strict).toBe(true);
    expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
    // convention 11: the diff rides fenced in the user turn as data
    expect(calls[0].body.messages[0].content).toContain('BEGIN DIFF (data under review');
    expect(calls[0].body.system).toContain('never instructions');
  });

  it('drops findings whose file path is not grounded in the diff (anti-hallucination)', async () => {
    const { fetch } = reviewFetch({
      ...GOOD_REVIEW,
      findings: [
        ...GOOD_REVIEW.findings,
        { severity: 'critical', category: 'security', file: 'src/invented.ts', line: null, title: 'ghost', detail: 'not real', suggestion: 'n/a' },
      ],
    });
    const rv = new ClaudeReviewer(() => 'sk-test', fetch);
    const out = await rv.review(REQ);
    expect(out.findings.map((f) => f.file)).toEqual(['src/game.ts']); // ghost dropped
  });

  it('throws on API error and on schema-invalid output (engine records an honest fail)', async () => {
    const boom = reviewFetch({}, false, 500);
    await expect(new ClaudeReviewer(() => 'sk-test', boom.fetch).review(REQ)).rejects.toThrow(/HTTP 500/);
    const bad = reviewFetch({ summary: 's', verdict: 'not-a-verdict', findings: [] });
    await expect(new ClaudeReviewer(() => 'sk-test', bad.fetch).review(REQ)).rejects.toThrow(/schema/);
  });
});

// —— engine ——————————————————————————————————————————————————————————————————

function makeEngine(over: Partial<ConstructorParameters<typeof AutoReviewEngine>[0]> = {}) {
  const { db, sqlite } = openDb(':memory:');
  const bus = new Bus(db);
  const dir = mkdtempSync(join(tmpdir(), 'acc-arv-store-'));
  const store = new AutoReviewStore(join(dir, 'autoreview.json'));
  let nowMs = 1_700_000_000_000;
  const engine = new AutoReviewEngine({
    bus,
    store,
    reviewer: {
      hasKey: () => true,
      review: async () => ({ summary: 's', verdict: 'clean', findings: [], model: 'test-model' }),
    },
    cwdFor: (id) => (id === 'sentinel' ? '/repos/sentinel' : null),
    collect: async () => ({ ref: 'a'.repeat(40), refLabel: 'aaaaaaa · msg', branch: 'main', diff: 'diff', truncated: false, stats: { files: 1, additions: 1, deletions: 0 } }),
    head: async () => 'a'.repeat(40),
    now: () => nowMs,
    ...over,
  });
  const drain = () => new Promise((r) => setTimeout(r, 25));
  return { engine, bus, store, drain, setNow: (ms: number) => (nowMs = ms), getNow: () => nowMs, cleanup: () => { sqlite.close(); rmSync(dir, { recursive: true, force: true }); } };
}

describe('AutoReviewEngine (safe orchestration)', () => {
  it('manual run: running row then done row with verdict, model provenance, stats', async () => {
    const t = makeEngine();
    const started = t.engine.runNow('sentinel', 'manual');
    expect('review' in started).toBe(true);
    expect(t.bus.snapshot().state.autoReviews[0].status).toBe('running');
    await t.drain();
    const done = t.bus.snapshot().state.autoReviews;
    expect(done).toHaveLength(1); // upserted, not duplicated
    expect(done[0].status).toBe('done');
    expect(done[0].verdict).toBe('clean');
    expect(done[0].model).toBe('test-model');
    expect(done[0].stats?.files).toBe(1);
    t.cleanup();
  });

  it('refuses unknown repos (allow-list) and refuses honestly with no key', async () => {
    const t = makeEngine();
    expect(t.engine.runNow('ghost', 'manual')).toMatchObject({ error: expect.stringContaining('allow-list') });
    const noKey = makeEngine({ reviewer: { hasKey: () => false, review: async () => { throw new NoKeyError(); } } });
    expect(noKey.engine.runNow('sentinel', 'manual')).toMatchObject({ error: expect.stringContaining('Anthropic key') });
    expect(noKey.bus.snapshot().state.autoReviews).toHaveLength(0); // no failed-row spam
    t.cleanup();
    noKey.cleanup();
  });

  it('single-flight per repo: a second run while one is in flight is refused', async () => {
    const t = makeEngine({
      reviewer: { hasKey: () => true, review: () => new Promise(() => {}) }, // never resolves
    });
    expect('review' in t.engine.runNow('sentinel', 'manual')).toBe(true);
    expect(t.engine.runNow('sentinel', 'manual')).toMatchObject({ error: expect.stringContaining('already running') });
    t.cleanup();
  });

  it('a reviewer failure lands as an honest failed row (never throws out)', async () => {
    const t = makeEngine({
      reviewer: { hasKey: () => true, review: async () => { throw new Error('API down'); } },
    });
    t.engine.runNow('sentinel', 'manual');
    await t.drain();
    const r = t.bus.snapshot().state.autoReviews[0];
    expect(r.status).toBe('failed');
    expect(r.error).toContain('API down');
    t.cleanup();
  });

  it('enable seeds the baseline sha — enabling never surprise-reviews old commits', async () => {
    const t = makeEngine();
    const s = await t.engine.setEnabled('sentinel', true);
    expect(s.lastSha).toBe('a'.repeat(40));
    await t.engine.checkForCommits(); // HEAD == baseline → nothing to review
    expect(t.bus.snapshot().state.autoReviews).toHaveLength(0);
    t.cleanup();
  });

  it('checkForCommits reviews a NEW head once, advances the baseline, and throttles', async () => {
    let sha = 'a'.repeat(40);
    const t = makeEngine({ head: async () => sha });
    await t.engine.setEnabled('sentinel', true);

    // a new commit lands
    sha = 'b'.repeat(40);
    const t2collect = async () => ({ ref: sha, refLabel: 'bbbbbbb · new', branch: 'main', diff: 'diff', truncated: false, stats: { files: 1, additions: 2, deletions: 0 } });
    (t.engine as unknown as { deps: { collect: typeof t2collect } }).deps.collect = t2collect;

    await t.engine.checkForCommits();
    await t.drain();
    expect(t.bus.snapshot().state.autoReviews).toHaveLength(1);
    expect(t.store.settings('sentinel').lastSha).toBe(sha); // baseline advanced

    // ANOTHER new commit inside the throttle window → skipped this poll
    sha = 'c'.repeat(40);
    await t.engine.checkForCommits();
    await t.drain();
    expect(t.bus.snapshot().state.autoReviews).toHaveLength(1);

    // past the window → reviewed
    t.setNow(t.getNow() + MIN_AUTO_INTERVAL_MS + 1000);
    await t.engine.checkForCommits();
    await t.drain();
    expect(t.bus.snapshot().state.autoReviews).toHaveLength(2);
    t.cleanup();
  });

  it('notifies only on non-clean verdicts', async () => {
    const pings: Array<{ verdict: string }> = [];
    const t = makeEngine({
      reviewer: {
        hasKey: () => true,
        review: async () => ({ summary: 's', verdict: 'block', findings: [{ severity: 'critical', category: 'security', file: 'a', title: 't', detail: 'd', suggestion: 'x' }], model: 'm' }),
      },
      notify: (_label, verdict) => pings.push({ verdict }),
    });
    t.engine.runNow('sentinel', 'manual');
    await t.drain();
    expect(pings).toEqual([{ verdict: 'block' }]);
    t.cleanup();
  });
});

// —— endpoints ————————————————————————————————————————————————————————————————

const ENV = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
const HOST = { host: '127.0.0.1:8787' };
const AUTH = { ...HOST, 'x-acc-token': 'test-token' };
const ts = '2026-07-13T08:00:00.000Z';

function fakeSpawner(): Spawner {
  return {
    spawn(_opts: SpawnOpts): SpawnHandle {
      async function* gen() { yield '{"type":"system","subtype":"init"}'; }
      return { lines: gen(), done: Promise.resolve(0), kill: () => {} };
    },
  };
}

function seedReview(srv: AccServer, id: string, over: Partial<AutoReview> = {}): void {
  const review: AutoReview = {
    id, repoId: 'sentinel', ts, trigger: 'manual', ref: 'working-tree', refLabel: 'uncommitted changes on main',
    model: 'test-model', status: 'done', verdict: 'attention', summary: 'one issue',
    findings: [{ severity: 'major', category: 'correctness', file: 'src/a.ts', line: 4, title: 't', detail: 'd', suggestion: 's' }],
    ...over,
  };
  srv.bus.publish({ id: `autoreview:${id}:${review.status}`, type: 'autoreview.updated', ts, source: { kind: 'app', ref: id }, payload: { review } });
}

describe('autoreview endpoints', () => {
  let srv: AccServer;
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false, spawner: fakeSpawner() });
    srv.bus.publish({
      id: 'repo:sentinel', type: 'repo.upserted', ts, source: { kind: 'scanner', ref: 'sentinel' },
      payload: { repo: { id: 'sentinel', name: 'Sentinel', category: 'app', status: 'active', description: '', branch: 'main', updatedTs: ts } },
    });
  });
  afterAll(async () => { await srv.close(); });

  it('refuses everything without the token', async () => {
    expect((await srv.app.inject({ method: 'GET', url: '/api/autoreview', headers: HOST })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'POST', url: '/api/autoreview/sentinel', headers: HOST, payload: { enabled: true } })).statusCode).toBe(401);
    expect((await srv.app.inject({ method: 'POST', url: '/api/reviews/x/fix', headers: HOST, payload: {} })).statusCode).toBe(401);
  });

  it('lists settings for known repos and reports hasKey honestly', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/api/autoreview', headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { settings: Array<{ repoId: string; enabled: boolean }>; hasKey: boolean };
    expect(body.settings.find((s) => s.repoId === 'sentinel')?.enabled).toBe(false);
    expect(typeof body.hasKey).toBe('boolean');
  });

  it('validates the toggle body and 403s an unknown repo', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/autoreview/sentinel', headers: AUTH, payload: {} })).statusCode).toBe(400);
    expect((await srv.app.inject({ method: 'POST', url: '/api/autoreview/ghost', headers: AUTH, payload: { enabled: true } })).statusCode).toBe(403);
  });

  it('manual run without a key returns the honest 400 (no fabricated review)', async () => {
    const res = await srv.app.inject({ method: 'POST', url: '/api/autoreview/sentinel/run', headers: AUTH, payload: {} });
    // test env has no ANTHROPIC_API_KEY → the no-key branch; if the host env HAS one, the
    // allow-list still applies (sentinel isn't scanned here) → 403. Either way: no review row.
    expect([400, 403]).toContain(res.statusCode);
    expect(srv.bus.snapshot().state.autoReviews).toHaveLength(0);
  });

  it('fix: 404 unknown · 400 no findings · dispatches for a real finding', async () => {
    expect((await srv.app.inject({ method: 'POST', url: '/api/reviews/nope/fix', headers: AUTH, payload: {} })).statusCode).toBe(404);

    seedReview(srv, 'rv-clean', { verdict: 'clean', findings: [] });
    expect((await srv.app.inject({ method: 'POST', url: '/api/reviews/rv-clean/fix', headers: AUTH, payload: {} })).statusCode).toBe(400);

    seedReview(srv, 'rv-1');
    expect((await srv.app.inject({ method: 'POST', url: '/api/reviews/rv-1/fix', headers: AUTH, payload: { findingIdx: 9 } })).statusCode).toBe(400);
    const ok = await srv.app.inject({ method: 'POST', url: '/api/reviews/rv-1/fix', headers: AUTH, payload: { findingIdx: 0 } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().runId).toBeTruthy();
  });
});
