import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildServer, type AccServer } from '../app';
import { extractMeta, readWorkflows, findWorkflowsDir } from './catalog';

describe('workflow meta extraction', () => {
  it('extracts name/description/whenToUse/phases from a real-shaped file', () => {
    const src = [
      "export const meta = {",
      "  name: 'review',",
      "  description: 'Adversarial review with a { brace } in the text',",
      "  whenToUse: 'Before committing.',",
      "  phases: [{ title: 'Review', detail: 'one agent per dimension' }, { title: 'Verify' }],",
      "};",
      "phase('Review');",
      "const x = await agent('...');",
    ].join('\n');
    const meta = extractMeta(src, 'review.js');
    expect(meta).not.toBeNull();
    expect(meta?.name).toBe('review');
    expect(meta?.whenToUse).toBe('Before committing.');
    expect(meta?.phases).toEqual([
      { title: 'Review', detail: 'one agent per dimension' },
      { title: 'Verify', detail: undefined },
    ]);
    expect(meta?.file).toBe('review.js');
  });

  it('returns null when there is no meta or it is malformed (skipped, not guessed)', () => {
    expect(extractMeta('const notMeta = 1;', 'x.js')).toBeNull();
    expect(extractMeta('export const meta = { name: 123 };', 'x.js')).toBeNull(); // name not a string
  });

  it('reads the actual .claude/workflows recipes in lifecycle order', () => {
    const dir = findWorkflowsDir();
    expect(dir).not.toBeNull();
    const metas = readWorkflows(dir as string);
    const names = metas.map((m) => m.name);
    expect(names).toContain('review');
    expect(names).toContain('understand');
    // lifecycle order: understand comes before review, review before verify-gate
    expect(names.indexOf('understand')).toBeLessThan(names.indexOf('review'));
    expect(names.indexOf('review')).toBeLessThan(names.indexOf('verify-gate'));
    // every recipe carries at least one phase and a description
    for (const m of metas) {
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.phases.length).toBeGreaterThan(0);
    }
  });

  it('readWorkflows returns [] for a missing directory (honest empty)', () => {
    expect(readWorkflows('/no/such/dir/anywhere')).toEqual([]);
  });
});

describe('GET /api/workflows', () => {
  const ENV = { port: 8789, webOrigin: 'http://localhost:5173', accToken: 'test-token', dbPath: ':memory:', demo: false, projectDirs: [] };
  const HOST = { host: '127.0.0.1:8789' };
  let srv: AccServer;
  beforeAll(async () => {
    srv = await buildServer(ENV, { startSystem: false });
  });
  afterAll(async () => {
    await srv.close();
  });

  it('serves the parsed catalog (non-sensitive reference data — no token needed)', async () => {
    const res = await srv.app.inject({ method: 'GET', url: '/api/workflows', headers: HOST });
    expect(res.statusCode).toBe(200);
    const { workflows } = res.json() as { workflows: { name: string; phases: unknown[] }[] };
    expect(workflows.length).toBeGreaterThanOrEqual(6);
    expect(workflows.find((w) => w.name === 'review')?.phases.length).toBeGreaterThan(0);
  });
});
