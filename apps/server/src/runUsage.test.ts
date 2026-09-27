import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { RunStats } from '@ado/shared';
import { buildServer } from './app';
import { openDb } from './db';
import { runs } from './db/schema';

it('preserves unknown and partial usage coverage in every aggregate across restart', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-usage-'));
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'fixture-key', dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  let server = await buildServer(env, { startSystem: false, startScanner: false });
  const { db, sqlite } = openDb(env.dbPath);
  try {
    const headers = { host: '127.0.0.1:8787', 'x-acc-token': env.accToken };
    const read = async () => {
      const res = await server.app.inject({ url: '/api/runs/stats', headers });
      expect(res.statusCode).toBe(200); return RunStats.parse(res.json().stats);
    };
    expect(await read()).toMatchObject({ total: 0, runsWithInputUsage: 0, runsWithOutputUsage: 0 });
    const startedTs = new Date().toISOString();
    const seed = (id: string, repoId: string, tokensIn: number | null, tokensOut: number | null, ts = startedTs) => db.insert(runs).values({ id, repoId, model: repoId, task: 'Synthetic usage', status: 'done', startedTs: ts, tokensIn, tokensOut }).run();
    seed('absent', 'unknown', null, null);
    expect(await read()).toMatchObject({ total: 1, runsWithoutUsage: 1, runsWithInputUsage: 0, runsWithOutputUsage: 0 });
    seed('zero', 'zero', 0, 0);
    seed('in', 'partial', 100, null);
    seed('out', 'partial', null, 25);
    seed('old', 'outside-window', 5000, 5000, '2020-01-01T00:00:00.000Z');
    const stats = await read();
    expect(stats).toMatchObject({ total: 4, tokensIn: 100, tokensOut: 25, runsWithoutUsage: 1, runsWithInputUsage: 2, runsWithOutputUsage: 2 });
    for (const group of [stats.byRepo, stats.byModel]) {
      expect(group).toHaveLength(3);
      expect(group).toContainEqual({ key: 'unknown', runs: 1, tokensIn: 0, tokensOut: 0, runsWithInputUsage: 0, runsWithOutputUsage: 0 });
      expect(group).toContainEqual({ key: 'zero', runs: 1, tokensIn: 0, tokensOut: 0, runsWithInputUsage: 1, runsWithOutputUsage: 1 });
      expect(group).toContainEqual({ key: 'partial', runs: 2, tokensIn: 100, tokensOut: 25, runsWithInputUsage: 1, runsWithOutputUsage: 1 });
    }
    await server.close();
    server = await buildServer(env, { startSystem: false, startScanner: false });
    expect(await read()).toEqual(stats);
    expect(db.select().from(runs).all()).toHaveLength(5);
  } finally { sqlite.close(); await server.close(); }
});
