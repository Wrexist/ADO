import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { commonGitIdentity } from '../projects/checkoutIdentity';
import { workspaceEvidence } from '../runner/workspace';
import { recoveryContentEvidence, compareRecoveredContent } from './content';
import { openDb } from '../db';
import { runs } from '../db/schema';

it('compares binary and untracked content through isolated metadata without invoking repository filters or fsmonitor', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-recovery-content-'));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const { db, sqlite } = openDb(':memory:');
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
    writeFileSync(join(repo, 'binary.dat'), Buffer.from([0, 1, 2]));
    writeFileSync(join(repo, '.gitattributes'), '*.dat filter=probe\n');
    git(['add', '.']); git(['commit', '-qm', 'base']);
    const base = git(['rev-parse', 'HEAD']); const identity = commonGitIdentity(repo);
    writeFileSync(join(repo, 'binary.dat'), Buffer.from([0, 3, 4]));
    writeFileSync(join(repo, ' leading-space.txt'), 'preserve');
    const expected = await workspaceEvidence(repo, base, identity);
    db.insert(runs).values({ id: 'result', repoId: 'fixture', task: 'Recovered result', model: 'default', status: 'done', startedTs: new Date().toISOString(), engineVersion: 1, workspacePath: repo, workspaceKind: 'isolated_clone', workspaceGitIdentity: identity, sourceGitIdentity: 'separate-source', baseSha: base, ...expected }).run();
    const run = db.select().from(runs).get()!;
    const marker = join(root, 'executed');
    const hook = join(root, 'probe.cjs'); writeFileSync(hook, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected execution');`);
    const command = `"${process.execPath.replace(/\\/g, '/')}" "${hook.replace(/\\/g, '/')}"`;
    for (const key of ['core.fsmonitor', 'filter.probe.clean', 'filter.probe.process', 'diff.external']) git(['config', key, command]);
    git(['config', 'filter.probe.required', 'true']);
    const index = readFileSync(join(repo, '.git/index')), config = readFileSync(join(repo, '.git/config'));
    expect(await recoveryContentEvidence(repo, base, identity)).toEqual(expected);
    expect(await compareRecoveredContent(run)).toMatchObject({ status: 'matches_recorded', executionEnabled: false });
    expect(await compareRecoveredContent({ ...run, diffDigest: null })).toMatchObject({ status: 'not_recorded', executionEnabled: false });
    expect(await compareRecoveredContent({ ...run, workspaceGitIdentity: 'wrong' })).toMatchObject({ status: 'unavailable', executionEnabled: false });
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(join(repo, '.git/index'))).toEqual(index); expect(readFileSync(join(repo, '.git/config'))).toEqual(config);
    writeFileSync(join(repo, 'binary.dat'), Buffer.from([0, 5, 6]));
    expect((await recoveryContentEvidence(repo, base, identity)).diffDigest).not.toBe(expected.diffDigest);
    expect(await compareRecoveredContent(run)).toMatchObject({ status: 'differs_from_recorded', executionEnabled: false });
    writeFileSync(join(repo, 'binary.dat'), Buffer.from([0, 3, 4]));
    writeFileSync(join(repo, ' leading-space.txt'), 'changed');
    expect((await recoveryContentEvidence(repo, base, identity)).diffDigest).not.toBe(expected.diffDigest);
    await expect(recoveryContentEvidence(repo, base, 'wrong-identity')).rejects.toThrow('identity changed');
    expect(existsSync(marker)).toBe(false);
    expect(db.select().from(runs).get()).toEqual(run);
  } finally { sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
// Multiple isolated Git comparisons; allow bounded Windows filesystem latency.
}, 120000);
