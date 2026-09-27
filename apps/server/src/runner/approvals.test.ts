import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, operationApprovals, approvalPolicyVersions } from '../db/schema';
import { ApprovalStore, type AcceptanceBinding } from './approvals';

const binding: AcceptanceBinding = { operation: 'result.accept', runId: 'run-a', repoId: 'repo-a', headSha: 'head-a', diffDigest: 'diff-a', workspacePath: 'isolated-a', baseSha: 'base-a', verificationId: 'verify-a', priorHumanAction: null };

it('binds reviews to actor, operation, repo, result, evidence and policy, with a five-minute expiry', () => {
  const { db, sqlite } = openDb(':memory:');
  let time = Date.parse('2026-09-27T12:00:00Z'); let policy = 'v1';
  const store = new ApprovalStore(db, () => policy, () => time);
  try {
    const version = store.policyVersion(binding.repoId);
    const review = store.prepare(binding, version);
    const effect = () => { throw new Error('Effect must not execute'); };
    for (const change of [{ runId: 'run-b' }, { repoId: 'repo-b' }, { headSha: 'head-b' }, { diffDigest: 'diff-b' }, { verificationId: 'verify-b' }, { workspacePath: 'other' }, { priorHumanAction: 'corrected' }, { operation: 'deploy' }]) {
      expect(() => store.consume(review.id, { ...binding, ...change } as AcceptanceBinding, version, effect)).toThrow('different operation or result');
    }
    expect(() => store.consume(review.id, binding, version, effect, 'other-owner')).toThrow('different operation or result');
    time += 300000;
    expect(() => store.consume(review.id, binding, version, effect)).toThrow('expired');
    time -= 300001;
    expect(() => store.consume(review.id, binding, version, effect)).toThrow('expired');
    time += 1;
    policy = 'v2';
    expect(() => store.consume(review.id, binding, version, effect)).toThrow('revoked');
    expect(store.history(binding.runId)[0].revokeReason).toBe('Project policy changed');
    policy = 'v1';
    expect(store.policyVersion(binding.repoId)).not.toBe(version);
    expect(() => store.consume(review.id, binding, version, effect)).toThrow('revoked');
  } finally { sqlite.close(); }
});

it('commits a decision once with its effect, rolls both back on failure, and prevents rewriting history', () => {
  const { db, sqlite } = openDb(':memory:');
  const store = new ApprovalStore(db);
  try {
    const version = store.policyVersion(binding.repoId);
    const review = store.prepare(binding, version);
    const insert = () => db.insert(runs).values({ id: 'effect', repoId: 'a', task: 'fixture', model: 'default', status: 'done', startedTs: new Date().toISOString() }).run();
    expect(() => db.update(operationApprovals).set({ headSha: 'rewritten' }).run()).toThrow('immutable');
    expect(() => store.consume(review.id, binding, version, () => { insert(); throw new Error('disk failure fixture'); })).toThrow('disk failure fixture');
    expect(db.select().from(runs).all()).toEqual([]);
    expect(store.history(binding.runId)[0].consumedTs).toBeNull();
    store.consume(review.id, binding, version, insert);
    expect(db.select().from(runs).all()).toHaveLength(1);
    expect(store.history(binding.runId)[0].consumedTs).not.toBeNull();
    expect(() => store.consume(review.id, binding, version, insert)).toThrow('already consumed');
    expect(() => db.update(operationApprovals).set({ headSha: 'rewritten' }).run()).toThrow('immutable');
    expect(() => db.update(operationApprovals).set({ consumedTs: null }).run()).toThrow('immutable');
    expect(() => db.delete(operationApprovals).run()).toThrow('append-only');
    expect(() => db.update(approvalPolicyVersions).set({ snapshotJson: 'rewritten' }).run()).toThrow('immutable');
  } finally { sqlite.close(); }
});

it('preserves prepared and consumed decisions across profile reopen and invalidates before a policy edit', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-approval-'));
  const file = join(root, 'profile.sqlite');
  let opened = openDb(file);
  try {
    let store = new ApprovalStore(opened.db);
    const version = store.policyVersion(binding.repoId);
    const review = store.prepare(binding, version);
    opened.sqlite.close(); opened = openDb(file); store = new ApprovalStore(opened.db);
    expect(store.policyVersion(binding.repoId)).toBe(version);
    store.consume(review.id, binding, version, () => 'recorded');
    const next = store.prepare(binding, version);
    store.invalidatePolicy(binding.repoId);
    expect(store.policyVersion(binding.repoId)).not.toBe(version);
    expect(store.history(binding.runId).find((r) => r.id === next.id)?.revokedTs).not.toBeNull();
    opened.sqlite.close(); opened = openDb(file); store = new ApprovalStore(opened.db);
    expect(store.history(binding.runId).find((r) => r.id === review.id)?.consumedTs).not.toBeNull();
    expect(store.history(binding.runId).find((r) => r.id === review.id)?.policySnapshot).toBe('trusted-local-result-accept-v1');
    expect(() => store.consume(next.id, binding, version, () => 'must not execute')).toThrow('revoked');
  } finally { opened.sqlite.close(); rmSync(root, { recursive: true, force: true }); }
});

it('fails closed for malformed persisted expiry and mismatched payload bytes', () => {
  const { db, sqlite } = openDb(':memory:');
  const store = new ApprovalStore(db);
  try {
    const version = store.policyVersion(binding.repoId);
    store.prepare(binding, version);
    const source = db.select().from(operationApprovals).all()[0];
    for (const bad of [{ expiresTs: 'invalid' }, { issuedTs: 'invalid' }, { expiresTs: '2099-01-01T00:00:00Z' }, { payloadJson: '{}' }]) {
      const id = randomUUID();
      db.insert(operationApprovals).values({ ...source, ...bad, id }).run();
      let called = false;
      expect(() => store.consume(id, binding, version, () => { called = true; })).toThrow();
      expect(called).toBe(false);
    }
  } finally { sqlite.close(); }
});
