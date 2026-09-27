import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { prepareWorkspace, workspaceEvidence } from './workspace';

it('isolates agent edits from the original checkout and records revision evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ado-workspace-')); const repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  try {
    git(['init', '-q']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.test']);
    writeFileSync(join(repo, 'file.txt'), 'original');
    writeFileSync(join(repo, 'binary.dat'), Buffer.from([0, 1, 2]));
    git(['add', '.']); git(['commit', '-qm', 'base']);
    const workspace = await prepareWorkspace(join(root, 'workspaces'), repo);
    writeFileSync(join(workspace.path, 'file.txt'), 'agent edit');
    expect(readFileSync(join(repo, 'file.txt'), 'utf8')).toBe('original');
    const evidence = await workspaceEvidence(workspace.path, workspace.baseSha);
    expect(evidence.headSha).toBe(workspace.baseSha); expect(evidence.diffDigest).toMatch(/^[a-f0-9]{64}$/);
    writeFileSync(join(workspace.path, 'binary.dat'), Buffer.from([0, 3, 4]));
    const binaryFirst = await workspaceEvidence(workspace.path, workspace.baseSha);
    writeFileSync(join(workspace.path, 'binary.dat'), Buffer.from([0, 5, 6]));
    const binarySecond = await workspaceEvidence(workspace.path, workspace.baseSha);
    expect(binaryFirst.diffDigest).not.toBe(binarySecond.diffDigest);
    writeFileSync(join(workspace.path, ' leading-space.txt'), 'first');
    const untrackedFirst = await workspaceEvidence(workspace.path, workspace.baseSha);
    writeFileSync(join(workspace.path, ' leading-space.txt'), 'second');
    expect((await workspaceEvidence(workspace.path, workspace.baseSha)).diffDigest).not.toBe(untrackedFirst.diffDigest);
    writeFileSync(join(repo, 'file.txt'), 'owner edit');
    await expect(prepareWorkspace(join(root, 'workspaces'), repo)).rejects.toThrow(/reviewed base/);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 120000);
