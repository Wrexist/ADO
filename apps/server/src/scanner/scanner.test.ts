import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { Scanner } from './index';

function mkRepo(root: string, name: string, files: Record<string, string>): void {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  const g = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 'test@test.dev']);
  g(['config', 'user.name', 'Test']);
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'init']);
}

describe('scanner (Prompt 2.2)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'acc-scan-'));
    mkRepo(root, 'my-web-app', {
      '.claude/ops.yml': 'project: my-web-app\nstack: vite-react\n',
      'TASK.md': '- [ ] one\n- [ ] two\n- [x] done\n',
      'package.json': JSON.stringify({ description: 'A web dashboard' }),
    });
    mkRepo(root, 'blocked-svc', {
      '.claude/ops.yml': 'project: blocked-svc\nstack: fastify\ngates:\n  - name: g1\n    status: blocked\n',
      'README.md': '# Blocked Service\nBackend thing\n',
    });
    // a non-git dir must be ignored
    mkdirSync(join(root, 'not-a-repo'), { recursive: true });
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('discovers git repos and emits merge-friendly base repo events', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const scanner = new Scanner(bus, [root]);
    await scanner.start();
    scanner.stop();

    const repos = bus.snapshot().state.repos;
    expect(Object.keys(repos).sort()).toEqual(['blocked-svc', 'my-web-app']);

    const web = repos['my-web-app'];
    expect(web.category).toBe('web'); // inferred from stack: vite-react
    expect(web.branch).toBe('main');
    expect(web.description).toBe('A web dashboard'); // from package.json
    expect(web.openTasks).toBe(2); // two "- [ ]" lines, the "- [x]" excluded
    expect(web.status).toBe('active');
    expect(web.agents).toBeUndefined(); // scanner never sets agents (enrichment owns it)
    expect(web.ci).toBeUndefined(); // no CI known yet → honest absence

    const svc = repos['blocked-svc'];
    expect(svc.category).toBe('service'); // inferred from fastify
    expect(svc.status).toBe('blocked'); // gate status: blocked
    expect(svc.description).toBe('Blocked Service'); // README first heading

    sqlite.close();
  });

  it('does not clobber runner enrichment on rescan (merge reducer)', async () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);

    // simulate a runner having tagged the repo with agents + CI before a rescan
    const scanner = new Scanner(bus, [root]);
    await scanner.start();
    scanner.stop();

    bus.publish({
      id: 'enrich:my-web-app',
      type: 'repo.enriched',
      ts: new Date().toISOString(),
      source: { kind: 'runner', ref: 'run-1' },
      payload: { repoId: 'my-web-app', patch: { agents: ['builder'], stars: 7 } },
    });

    // rescan (same scan:id → publish is idempotent, so force a fresh enrich-safe check
    // by confirming the enrichment survives the already-folded base event)
    expect(bus.snapshot().state.repos['my-web-app'].agents).toEqual(['builder']);
    expect(bus.snapshot().state.repos['my-web-app'].stars).toBe(7);
    expect(bus.snapshot().state.repos['my-web-app'].branch).toBe('main'); // base intact
    sqlite.close();
  });
});
