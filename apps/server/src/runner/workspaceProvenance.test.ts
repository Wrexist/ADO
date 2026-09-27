import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, verificationAttempts } from '../db/schema';
import { commonGitIdentity } from '../projects/checkoutIdentity';
import { prepareWorkspace, workspaceEvidence } from './workspace';
import { Verifier } from './verification';
import { ApprovalStore } from './approvals';

it('binds immutable workspace provenance and refuses a byte-identical replacement repository', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-workspace-provenance-')), source = join(root, 'source'); mkdirSync(source);
  const git = (args: string[]) => execFileSync('git', args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const { db, sqlite } = openDb(join(root, 'profile.sqlite'));
  try {
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
    writeFileSync(join(source, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } }));
    writeFileSync(join(source, 'verify.cjs'), 'console.log("offline verification")'); git(['add', '.']); git(['commit', '-qm', 'base']);
    const workspace = await prepareWorkspace(join(root, 'results'), source);
    const evidence = await workspaceEvidence(workspace.path, workspace.baseSha, workspace.gitIdentity);
    db.insert(runs).values({ id: 'run', repoId: 'source', task: 'Fixture', model: 'default', status: 'done', engineVersion: 1, startedTs: new Date().toISOString(), workspacePath: workspace.path, workspaceKind: workspace.kind, workspaceGitIdentity: workspace.gitIdentity, sourceGitIdentity: commonGitIdentity(source), baseSha: workspace.baseSha, branch: workspace.branch, ...evidence }).run();
    for (const patch of [{ workspaceKind: 'worktree' }, { workspaceKind: null, workspaceGitIdentity: null }, { workspaceGitIdentity: 'different' }, { workspacePath: source }, { baseSha: 'b'.repeat(40) }, { branch: 'other' }]) expect(() => db.update(runs).set(patch).run()).toThrow('immutable');
    expect(() => db.insert(runs).values({ id: 'invalid', repoId: 'source', task: 'x', model: 'default', status: 'done', startedTs: new Date().toISOString(), workspaceKind: 'isolated_clone' }).run()).toThrow('complete');
    const approvals = new ApprovalStore(db), verifier = new Verifier(db, () => [], approvals);
    expect((await verifier.verify('run')).verdict).toBe('pass');
    const target = { ...evidence, operation: 'result.accept', policyVersion: approvals.policyVersion('source') };
    const review = await verifier.prepareAcceptance('run', target);
    const replacement = await prepareWorkspace(join(root, 'replacements'), source);
    expect(await workspaceEvidence(replacement.path, replacement.baseSha)).toEqual(evidence);
    renameSync(workspace.path, join(root, 'preserved-result')); renameSync(replacement.path, workspace.path);
    await expect(verifier.accept('run', { ...target, approvalId: review.id })).rejects.toThrow('identity changed');
    expect(db.select().from(runs).get()).toMatchObject({ verifyVerdict: null, humanAction: null, workspaceKind: 'isolated_clone', workspaceGitIdentity: workspace.gitIdentity });
    db.update(runs).set({ verifyVerdict: 'pass', humanAction: 'accepted' }).run();
    await expect(verifier.verify('run')).rejects.toThrow('identity changed');
    expect(db.select().from(runs).get()).toMatchObject({ verifyVerdict: null, humanAction: null });
    expect(db.select().from(verificationAttempts).all()).toHaveLength(1);
  } finally { sqlite.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 120000);
