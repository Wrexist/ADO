import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db';
import { automationDispatches, runs, verificationAttempts, executionLocks } from '../db/schema';
import { ConnectionFile } from '../connections/file';
import { inspectRecoveryReferences } from './references';
import { compareRecoveredContent } from './content';

export class RecoveryActivation {
  private approval: { token: string; digest: string; expires: number } | null = null;
  private file: ConnectionFile;
  private state: Record<string, unknown>;
  constructor(private db: Db, private directory: string, private hostId: string) {
    this.file = new ConnectionFile(join(directory, 'restore-state.json'));
    this.state = this.file.read();
  }
  get restartRequired() { return this.state.mode === 'manual'; }
  private async inspect() {
    const references = inspectRecoveryReferences(this.db, this.hostId);
    const runRows = this.db.select().from(runs).all();
    const attempts = this.db.select().from(verificationAttempts).all();
    const locks = this.db.select().from(executionLocks).all();
    const automationReceipts = this.db.select().from(automationDispatches).all();
    const blockers: string[] = [];
    if (references.pendingRuns) blockers.push('Old queued or running jobs require explicit resolution; they will not be restarted.');
    if (references.pendingVerifications) blockers.push('An old verification is unresolved.');
    if (runRows.some((run) => run.processTermination === 'unconfirmed' || (run.processIdentity && run.processTermination !== 'confirmed')) || attempts.some((attempt) => attempt.processTermination === 'unconfirmed' || (attempt.processIdentity && attempt.processTermination !== 'confirmed'))) blockers.push('Recorded process termination is uncertain; manual activation cannot clear that uncertainty.');
    if (locks.length) blockers.push('Retained writer locks require confirmed process termination. Activation cannot release them.');
    if (automationReceipts.some((receipt) => !receipt.recordedTs)) blockers.push('Accepted automation runs have unresolved history receipts. Activation cannot repeat or discard them.');
    if (references.references.some((ref) => ref.status !== 'identity_matches')) blockers.push('Some local references are missing, replaced, foreign or insufficiently recorded.');
    const contents = [];
    for (const run of runRows.filter((run) => run.workspacePath && run.status === 'done')) {
      const content = await compareRecoveredContent(run);
      contents.push({ runId: content.runId, status: content.status });
      if (content.status !== 'matches_recorded') blockers.push(`Saved result ${run.id} has not matched its recorded content.`);
    }
    const files = readdirSync(this.directory).filter((name) => name.endsWith('.json')).sort().map((name) => [name, createHash('sha256').update(readFileSync(join(this.directory, name))).digest('hex')]);
    const digest = createHash('sha256').update(JSON.stringify({ references: references.references, runRows, attempts, locks, automationReceipts, contents, files })).digest('hex');
    return { blockers, digest, references: references.references.length, comparedResults: contents.length };
  }
  async prepare() {
    this.approval = null;
    if (this.state.mode !== 'review') throw new Error('Profile is not awaiting recovery review');
    const review = await this.inspect();
    if (review.blockers.length) return { ...review, token: null };
    this.approval = { token: randomUUID(), digest: review.digest, expires: Date.now() + 300_000 };
    return { ...review, token: this.approval.token };
  }
  async activate(token: unknown, confirmation: unknown) {
    const approval = this.approval; this.approval = null;
    if (!approval || token !== approval.token || confirmation !== 'ENABLE MANUAL OPERATION' || Date.now() > approval.expires) throw new Error('Review again and explicitly confirm manual operation');
    const current = await this.inspect();
    if (current.blockers.length || current.digest !== approval.digest) throw new Error('Recovery state changed; review again. Profile remains paused.');
    const next = { ...this.state, mode: 'manual', activation: { approvedAt: new Date().toISOString(), digest: current.digest } };
    try { this.file.write(next); this.state = next; }
    catch { throw new Error('Recovery marker could not be preserved safely; restart and review the profile before proceeding'); }
    return { restartRequired: true, mode: 'manual' as const };
  }
}
