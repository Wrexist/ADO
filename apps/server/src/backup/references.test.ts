import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, portfolioProjects, portfolioRepositories, portfolioCheckouts } from '../db/schema';
import { directoryIdentity, commonGitIdentity, pathKey } from '../projects/checkoutIdentity';
import { inspectRecoveryReferences } from './references';

it('distinguishes missing, replaced, foreign and unrecorded references without changing dirty Git work or database rows', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-recovery-references-'));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const { db, sqlite } = openDb(':memory:');
  try {
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
    writeFileSync(join(repo, 'file.txt'), 'base'); git(['add', '.']); git(['commit', '-qm', 'base']);
    writeFileSync(join(repo, 'file.txt'), 'dirty work'); writeFileSync(join(repo, 'untracked.txt'), 'preserve this');
    const index = readFileSync(join(repo, '.git/index')); const config = readFileSync(join(repo, '.git/config'));
    const gitIdentity = commonGitIdentity(repo);
    const now = new Date().toISOString();
    db.insert(portfolioProjects).values({ id: 'p', name: 'Project', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 3, version: 1, createdTs: now, updatedTs: now }).run();
    db.insert(portfolioRepositories).values({ id: 'r', projectId: 'p', host: 'local', externalId: 'r', name: 'Repo', observedTs: now }).run();
    db.insert(portfolioCheckouts).values({ id: 'c', repositoryId: 'r', hostId: 'local-host', canonicalPath: pathKey(repo), pathIdentity: directoryIdentity(repo), gitIdentity, sourceId: 'fixture', managed: false, observedTs: now }).run();
    const run = { repoId: 'fixture', task: 'Preserve', model: 'default', status: 'done', engineVersion: 1, startedTs: now };
    const provenance = { workspaceKind: 'isolated_clone', workspaceGitIdentity: gitIdentity, sourceGitIdentity: 'separate-source', baseSha: git(['rev-parse', 'HEAD']) };
    db.insert(runs).values([
      { ...run, ...provenance, id: 'matching', workspacePath: repo },
      { ...run, ...provenance, id: 'missing', workspacePath: join(root, 'gone') },
      { ...run, id: 'legacy', workspacePath: repo },
      { ...run, id: 'no-path' },
    ]).run();
    const before = sqlite.prepare('SELECT * FROM runs ORDER BY id').all();
    const report = inspectRecoveryReferences(db, 'local-host');
    expect(report.references.map((r) => [r.id, r.status])).toEqual([
      ['c', 'identity_matches'], ['matching', 'identity_matches'], ['missing', 'missing'], ['legacy', 'unrecorded'], ['no-path', 'unrecorded'],
    ]);
    expect(report).toMatchObject({ contentVerified: false, executionEnabled: false });
    expect(inspectRecoveryReferences(db, 'other-host').references[0].status).toBe('other_host');
    expect(readFileSync(join(repo, 'file.txt'), 'utf8')).toBe('dirty work');
    expect(readFileSync(join(repo, 'untracked.txt'), 'utf8')).toBe('preserve this');
    expect(readFileSync(join(repo, '.git/index'))).toEqual(index); expect(readFileSync(join(repo, '.git/config'))).toEqual(config);
    renameSync(join(repo, '.git'), join(repo, '.git-preserved')); git(['init', '-q']);
    const replaced = inspectRecoveryReferences(db, 'local-host');
    expect(replaced.references.find((r) => r.id === 'c')?.status).toBe('replaced');
    expect(replaced.references.find((r) => r.id === 'matching')?.status).toBe('replaced');
    expect(sqlite.prepare('SELECT * FROM runs ORDER BY id').all()).toEqual(before);
  } finally { sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
