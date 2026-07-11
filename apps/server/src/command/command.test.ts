import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { Runner } from '../runner';
import { HeuristicParser } from './parser';
import { execute, respond } from './execute';

const REPOS = ['sentinel', 'bloom', 'dynasty-manager'];
const parse = (t: string) => new HeuristicParser().parse(t, REPOS);

describe('heuristic intent parser (5 intents)', () => {
  it('classifies the five intents', () => {
    expect(parse('status').type).toBe('status_query');
    expect(parse("how's everything?").type).toBe('status_query');
    expect(parse('summarize recent activity').type).toBe('summarize_activity');
    expect(parse('gate status of sentinel').type).toBe('run_gate');
    expect(parse('add task to bloom: wire onboarding').type).toBe('create_task');
    expect(parse('fix the flaky test in sentinel').type).toBe('dispatch_task');
  });

  it('extracts repo + task for actionable intents', () => {
    const d = parse('fix the flaky wave test in sentinel');
    expect(d.repoId).toBe('sentinel');
    expect(d.task).toContain('flaky');
    const c = parse('add task to bloom: add analytics');
    expect(c.repoId).toBe('bloom');
    expect(c.task).toBe('add analytics');
  });

  it('falls back to unknown with low confidence', () => {
    const u = parse('sing me a song');
    expect(u.type).toBe('unknown');
    expect(u.confidence).toBeLessThan(0.5);
  });
});

let tmp: string;
const cwd = (id: string) => (id === 'sentinel' ? tmp : null);
afterEach(() => tmp && rmSync(tmp, { recursive: true, force: true }));

function deps() {
  const { db, sqlite } = openDb(':memory:');
  const bus = new Bus(db);
  const runner = new Runner(bus, db, { spawn: () => ({ lines: (async function* () {})(), done: Promise.resolve(0), kill: () => {} }) }, { cwdFor: cwd });
  return { deps: { bus, runner, cwdFor: cwd }, sqlite };
}

describe('intent execution (read now, mutate on confirm)', () => {
  it('answers status without side effects', () => {
    const { deps: d, sqlite } = deps();
    const r = respond(parse('status'), d);
    expect(r.kind).toBe('read');
    expect(r.message).toMatch(/repositories/);
    expect(r.confirm).toBeNull();
    sqlite.close();
  });

  it('create_task previews first, then writes TASK.md only on confirm', () => {
    tmp = mkdtempSync(join(tmpdir(), 'acc-cmd-'));
    writeFileSync(join(tmp, 'TASK.md'), '# TASK\n');
    const { deps: d, sqlite } = deps();

    const preview = respond(parse('add task to sentinel: ship the thing'), d);
    expect(preview.kind).toBe('mutate');
    expect(preview.confirm).not.toBeNull();
    // nothing written yet
    expect(readFileSync(join(tmp, 'TASK.md'), 'utf8')).not.toContain('ship the thing');

    const res = execute(preview.confirm!, d);
    expect(res.ok).toBe(true);
    expect(readFileSync(join(tmp, 'TASK.md'), 'utf8')).toContain('- [ ] ship the thing');
    sqlite.close();
  });

  it('dispatch_task rejects an unscanned repo, dispatches a scanned one on confirm', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'acc-cmd-'));
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    const { deps: d, sqlite } = deps();

    expect(respond(parse('fix bugs in bloom'), d).kind).toBe('unknown'); // bloom not scanned
    const ok = respond(parse('fix the flaky test in sentinel'), d);
    expect(ok.kind).toBe('mutate');
    expect(execute(ok.confirm!, d).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 30)); // let the fake agent's run() finish before close
    sqlite.close();
  });
});
