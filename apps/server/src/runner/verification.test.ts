import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, verificationEvidence } from '../db/schema';
import { workspaceEvidence } from './workspace';
import { Verifier } from './verification';

it('binds an independent verify result to exact code and rejects later modifications', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ado-verify-')); const repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const { db, sqlite } = openDb(':memory:');
  try {
    git(['init', '-q']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.test']);
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } }));
    writeFileSync(join(repo, 'verify.cjs'), 'console.log("control test passed")');
    git(['add', '.']); git(['commit', '-qm', 'base']); const baseSha = git(['rev-parse', 'HEAD']);
    const evidence = await workspaceEvidence(repo, baseSha);
    db.insert(runs).values({ id: 'r', repoId: 'a', task: 'x', model: 'default', status: 'done', startedTs: new Date().toISOString(), workspacePath: repo, baseSha, ...evidence }).run();
    const verifier = new Verifier(db, () => []);
    expect((await verifier.verify('r')).verdict).toBe('pass');
    expect(db.select().from(verificationEvidence).all()[0]).toMatchObject({ headSha: baseSha, diffDigest: evidence.diffDigest, exitCode: 0 });
    writeFileSync(join(repo, 'verify.cjs'), 'throw new Error("changed")');
    await expect(verifier.verify('r')).rejects.toThrow(/changed/);
  } finally { sqlite.close(); rmSync(root, { recursive: true, force: true }); }
}, 120000);
