import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Repo } from '@ado/shared';
import { openDb } from '../db';
import { ProjectRegistry } from './registry';

const input = (name: string) => ({ name, kind: 'app', goal: 'Manual goal', lifecycle: 'active', focus: true, manualPriority: 3 });
const gh = (externalId: string, name: string, defaultBranch = 'Main') => ({ externalId, name, owner: 'owner', defaultBranch, description: null, language: null, stargazers: 0, pushedAt: null });
const observation = (id: string, path: string): Repo => ({ id, name: 'Same name', localPath: path, category: 'app', status: 'active', description: '', branch: 'unknown', updatedTs: '2026-09-27T00:00:00Z' });

it('separates external IDs, preserves manual project data through rename/default-branch observations, and rejects reassignment', async () => {
  const { db, sqlite } = openDb(':memory:');
  const registry = new ProjectRegistry(db, () => [], () => null);
  try {
    const a = registry.create(input('Product A')), b = registry.create(input('Product B'));
    registry.observeGitHub([gh('101', 'project'), gh('102', 'Project')], '2026-09-27T00:00:00Z');
    const first = await registry.importSource({ projectId: a.id, sourceId: 'github:101' });
    const second = await registry.importSource({ projectId: b.id, sourceId: 'github:102' });
    expect(first.repositoryId).not.toBe(second.repositoryId);
    await expect(registry.importSource({ projectId: b.id, sourceId: 'github:101' })).rejects.toThrow('another project');
    registry.observeGitHub([gh('101', 'renamed', 'Release/Main')], '2026-09-27T01:00:00Z');
    const snapshot = registry.snapshot();
    expect(snapshot.projects).toEqual([a, b]);
    expect(snapshot.repositories.find((r) => r.id === first.repositoryId)).toMatchObject({ projectId: a.id, name: 'owner/renamed', defaultBranch: 'Release/Main' });
    expect(snapshot.repositories.find((r) => r.id === second.repositoryId)?.name).toBe('owner/Project');
    const updated = registry.update(a.id, { ...input('Renamed product'), version: a.version });
    expect(updated.id).toBe(a.id); expect(updated.version).toBe(2);
    expect(() => registry.update(a.id, { ...input('Lost update'), version: a.version })).toThrow('reload');
    expect(registry.snapshot().projects[0].name).toBe('Renamed product');
  } finally { sqlite.close(); }
});

it('keeps real checkout identities across worktrees, folder rename and reopen, without changing original Git or dirty files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-registry-'));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let opened = openDb(join(root, 'profile.sqlite'));
  let observations: Repo[] = [];
  const paths = new Map<string, string>();
  const makeRegistry = () => new ProjectRegistry(opened.db, () => observations, (id) => paths.get(id) ?? null);
  try {
    git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
    writeFileSync(join(repo, 'tracked.txt'), 'base'); git(['add', '.']); git(['commit', '-qm', 'base']);
    const worktree = join(root, 'other'); git(['worktree', 'add', '-qb', 'second', worktree]);
    writeFileSync(join(repo, 'tracked.txt'), 'dirty'); writeFileSync(join(repo, 'untracked.txt'), 'preserve');
    const before = git(['status', '--porcelain=v1']);
    const config = readFileSync(join(repo, '.git/config'));
    const index = readFileSync(join(repo, '.git/index'));
    observations = [observation('a', repo), observation('b', worktree)]; paths.set('a', repo); paths.set('b', worktree);
    let registry = makeRegistry(); const project = registry.create(input('Product'));
    const first = await registry.importSource({ projectId: project.id, sourceId: 'local:a' });
    const second = await registry.importSource({ projectId: project.id, sourceId: 'local:b' });
    expect(second.repositoryId).toBe(first.repositoryId); expect(second.checkoutId).not.toBe(first.checkoutId);
    expect(git(['status', '--porcelain=v1'])).toBe(before);
    expect(readFileSync(join(repo, '.git/config'))).toEqual(config); expect(readFileSync(join(repo, '.git/index'))).toEqual(index);
    const other = registry.create(input('Other'));
    await expect(registry.importSource({ projectId: other.id, sourceId: 'local:a' })).rejects.toThrow('another project');
    // Remove the test-owned linked worktree before moving its common directory.
    git(['worktree', 'remove', worktree]);
    const moved = join(root, 'renamed'); renameSync(repo, moved);
    observations = [observation('new-source-id', moved)]; paths.set('new-source-id', moved);
    opened.sqlite.close(); opened = openDb(join(root, 'profile.sqlite')); registry = makeRegistry();
    expect(await registry.importSource({ projectId: project.id, sourceId: 'local:new-source-id' })).toEqual(first);
    expect(registry.snapshot().checkouts.find((c) => c.id === first.checkoutId)?.canonicalPath).toBe(process.platform === 'win32' ? moved.toLowerCase() : moved);
    expect(readFileSync(join(moved, 'tracked.txt'), 'utf8')).toBe('dirty');
    expect(readFileSync(join(moved, 'untracked.txt'), 'utf8')).toBe('preserve');
  } finally { opened.sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 120000);

it('records an unborn repository without inventing a branch or commit and detects replacement at the same path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-registry-unborn-'));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const init = () => execFileSync('git', ['init', '-q', repo], { stdio: 'ignore' });
  const { db, sqlite } = openDb(':memory:');
  const registry = new ProjectRegistry(db, () => [observation('source', repo)], () => repo);
  try {
    init(); const project = registry.create(input('Unborn'));
    await registry.importSource({ projectId: project.id, sourceId: 'local:source' });
    expect(registry.snapshot().checkouts[0].headSha).toBeNull();
    expect(registry.snapshot().repositories[0].defaultBranch).toBeNull();
    renameSync(repo, join(root, 'preserved-original')); mkdirSync(repo); init();
    await expect(registry.importSource({ projectId: project.id, sourceId: 'local:source' })).rejects.toThrow('different directory');
    expect(registry.snapshot().checkouts).toHaveLength(1);
  } finally { sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 60000);

it('requires explicit matching GitHub association, collapses directory aliases, and refuses unregistered sources', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-registry-links-'));
  const repo = join(root, 'repo'); mkdirSync(repo);
  const alias = join(root, 'alias');
  const { db, sqlite } = openDb(':memory:');
  const registry = new ProjectRegistry(db, () => [observation('source', repo), observation('alias', alias)], (id) => id === 'source' ? repo : id === 'alias' ? alias : null);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  try {
    git(['init', '-q']); git(['remote', 'add', 'origin', 'git@github.com:owner/expected.git']);
    symlinkSync(repo, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const project = registry.create(input('Linked'));
    registry.observeGitHub([gh('301', 'expected'), gh('302', 'different')], '2026-09-27T00:00:00Z');
    const matching = await registry.importSource({ projectId: project.id, sourceId: 'github:301' });
    const wrong = await registry.importSource({ projectId: project.id, sourceId: 'github:302' });
    await expect(registry.importSource({ projectId: project.id, sourceId: 'local:source', repositoryId: wrong.repositoryId })).rejects.toThrow('remote to match');
    await expect(registry.importSource({ projectId: project.id, sourceId: 'local:unregistered' })).rejects.toThrow('observed scanner');
    await expect(registry.importSource({ projectId: project.id, sourceId: 'local:source', path: repo })).rejects.toThrow();
    const linked = await registry.importSource({ projectId: project.id, sourceId: 'local:source', repositoryId: matching.repositoryId });
    expect(linked.repositoryId).toBe(matching.repositoryId);
    expect(await registry.importSource({ projectId: project.id, sourceId: 'local:alias' })).toEqual(linked);
    await expect(registry.importSource({ projectId: project.id, sourceId: 'local:alias', repositoryId: wrong.repositoryId })).rejects.toThrow('another repository');
    expect(registry.snapshot().checkouts).toHaveLength(1);
    expect(registry.snapshot().checkouts[0].managed).toBe(false);
    expect(registry.snapshot().repositories).toHaveLength(2);
  } finally { sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 60000);
