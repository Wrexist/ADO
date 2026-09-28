import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { ContextSourcePreview } from '@ado/shared';
import { openDb } from '../db';
import { contextPackages, contextPackageReviews, portfolioRepositories, portfolioCheckouts } from '../db/schema';
import { ProjectRegistry } from './registry';
import { PlanningStore } from './planning';
import { ContextPackages } from './contextPackages';

function fixture() {
  const { db, sqlite } = openDb(':memory:');
  const project = new ProjectRegistry(db, () => [], () => null).create({ name: 'Context package fixture', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 });
  const repositoryId = randomUUID(), checkoutId = randomUUID(), now = new Date().toISOString();
  db.insert(portfolioRepositories).values({ id: repositoryId, projectId: project.id, host: 'local', externalId: 'fixture', name: 'Fixture', observedTs: now }).run();
  db.insert(portfolioCheckouts).values({ id: checkoutId, repositoryId, hostId: 'fixture', canonicalPath: '/fixture', pathIdentity: 'fixture', gitIdentity: 'fixture', sourceId: 'fixture', managed: false, observedTs: now }).run();
  const task = new PlanningStore(db).saveTask({ projectId: project.id, repositoryId, milestoneId: null, title: 'Context task', outcome: '', scope: '', outOfScope: '', acceptance: [], dependsOn: [], priority: 0, status: 'draft', sourceRefs: [] });
  const text = 'Owner-selected reference', baseSha = 'a'.repeat(40);
  const source = ContextSourcePreview.parse({ taskId: task.id, taskVersion: task.version, projectId: project.id, repositoryId, checkoutId, baseSha, observedTs: now, executionEnabled: false, authority: 'reference_only', status: 'unreviewed', totalBytes: Buffer.byteLength(text), maxBytes: 65536, files: [{ path: 'notes.md', blobId: 'b'.repeat(40), sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), text, comparison: 'not_supplied' }] });
  const input = { id: randomUUID(), version: task.version, checkoutId, baseSha, files: [{ path: 'notes.md' }] };
  const secrets: string[] = [], store = new ContextPackages(db, () => secrets);
  return { db, sqlite, task, source, input, secrets, store };
}

it('keeps immutable exact packages and versioned revocation history, with deduplicated creation and decisions', () => {
  const h = fixture();
  try {
    const pkg = h.store.save(h.task.id, h.input, h.source);
    expect(pkg.reviewVersion).toBe(0); expect(h.store.replay(h.task.id, h.input)).toEqual(pkg);
    expect(() => h.store.replay(h.task.id, { ...h.input, baseSha: 'c'.repeat(40) })).toThrow('different content');
    expect(() => h.db.update(contextPackages).set({ digest: '0'.repeat(64) }).run()).toThrow('immutable');
    const approve = { id: randomUUID(), version: 0, digest: pkg.digest, decision: 'approved_for_context', reason: 'Reviewed selected reference bytes' };
    expect(() => h.store.review(pkg.id, approve)).toThrow('rechecked');
    expect(() => h.store.review(pkg.id, { ...approve, digest: '0'.repeat(64) }, h.source)).toThrow('changed');
    expect(h.store.review(pkg.id, approve, h.source)).toMatchObject({ reviewVersion: 1, decision: 'approved_for_context' });
    expect(h.store.review(pkg.id, approve, h.source)).toMatchObject({ reviewVersion: 1 });
    expect(() => h.store.review(pkg.id, { ...approve, id: randomUUID() }, h.source)).toThrow('changed');
    const revoke = { ...approve, id: randomUUID(), version: 1, decision: 'revoked', reason: 'No longer applicable' };
    expect(h.store.review(pkg.id, revoke)).toMatchObject({ reviewVersion: 2, decision: 'revoked' });
    expect(h.store.review(pkg.id, approve, h.source)).toMatchObject({ reviewVersion: 2, decision: 'revoked' });
    expect(h.store.get(pkg.id).history).toHaveLength(2);
    expect(h.store.get(pkg.id).payload.source.executionEnabled).toBe(false);
    expect(() => h.db.update(contextPackageReviews).set({ reason: 'replace decision' }).run()).toThrow('immutable');
    h.secrets.push('Owner-selected');
    expect(() => h.store.get(pkg.id)).toThrow('configured secret');
    expect(h.store.status(pkg.id)).not.toHaveProperty('payload');
    expect(h.store.list(h.task.id).packages[0]).toMatchObject({ packageId: pkg.id, decision: 'revoked' });
    expect(JSON.stringify(h.store.list(h.task.id))).not.toContain('Owner-selected');
    expect(h.store.review(pkg.id, { ...revoke, id: randomUUID(), version: 2 })).toMatchObject({ decision: 'revoked', reviewVersion: 3 });
  } finally { h.sqlite.close(); }
});

it('pages package identities without omissions when creation timestamps collide and refuses a foreign task cursor', () => {
  const h = fixture();
  const clock = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-09-28T00:00:00.000Z');
  try {
    const ids = Array.from({ length: 51 }, () => randomUUID());
    for (const id of ids) h.store.save(h.task.id, { ...h.input, id }, h.source);
    const first = h.store.list(h.task.id);
    expect(first.packages).toHaveLength(50); expect(first.nextCursor).toBeTruthy();
    const last = h.store.list(h.task.id, first.nextCursor!);
    expect(last.packages).toHaveLength(1); expect(last.nextCursor).toBeNull();
    expect([...first.packages, ...last.packages].map(p => p.packageId)).toEqual(ids.sort().reverse());
    expect(() => h.store.list(randomUUID(), first.nextCursor!)).toThrow('another task');
    expect(JSON.stringify(first)).not.toContain(h.source.files[0].text);
    expect(JSON.stringify(first)).not.toContain(h.source.files[0].path);
  } finally { clock.mockRestore(); h.sqlite.close(); }
});

it('rolls back failed persistence and refuses corrupt bytes instead of returning an empty package', () => {
  const h = fixture();
  try {
    h.sqlite.exec("CREATE TRIGGER context_write_fault BEFORE INSERT ON context_packages BEGIN SELECT RAISE(ABORT,'fixture storage failure'); END");
    expect(() => h.store.save(h.task.id, h.input, h.source)).toThrow('storage failure');
    expect(h.db.select().from(contextPackages).all()).toEqual([]);
    h.sqlite.exec('DROP TRIGGER context_write_fault');
    expect(() => h.store.save(h.task.id, h.input, { ...h.source, files: h.source.files.map(f => ({ ...f, text: 'Wrong bytes' })) })).toThrow('integrity');
    expect(h.db.select().from(contextPackages).all()).toEqual([]);
    const pkg = h.store.save(h.task.id, h.input, h.source);
    h.sqlite.exec("CREATE TRIGGER context_review_fault BEFORE INSERT ON context_package_reviews BEGIN SELECT RAISE(ABORT,'fixture review failure'); END");
    expect(() => h.store.review(pkg.id, { id: randomUUID(), version: 0, digest: pkg.digest, decision: 'approved_for_context', reason: 'Fixture review' }, h.source)).toThrow('review failure');
    expect(h.store.get(pkg.id).reviewVersion).toBe(0);
    h.sqlite.exec('DROP TRIGGER context_package_no_update');
    h.db.update(contextPackages).set({ payloadJson: '{}' }).where(eq(contextPackages.id, pkg.id)).run();
    expect(() => h.store.get(pkg.id)).toThrow();
  } finally { h.sqlite.close(); }
});

it('requires a new package when the task revision changes, preserving the historical source package', () => {
  const h = fixture();
  try {
    const pkg = h.store.save(h.task.id, h.input, h.source);
    const { id, version, createdTs: _created, updatedTs: _updated, blockedBy: _blocked, ...definition } = h.task;
    new PlanningStore(h.db).saveTask({ ...definition, version, title: 'Changed scope' }, id);
    expect(() => h.store.review(pkg.id, { id: randomUUID(), version: 0, digest: pkg.digest, decision: 'approved_for_context', reason: 'Old review' }, h.source)).toThrow('revision changed');
    expect(h.store.get(pkg.id).payload).toEqual(pkg.payload);
    expect(h.store.get(pkg.id).reviewVersion).toBe(0);
  } finally { h.sqlite.close(); }
});
