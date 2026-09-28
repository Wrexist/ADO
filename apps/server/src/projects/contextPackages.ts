import { createHash } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { ContextPackageCreate, ContextPackagePayload, ContextPackageReviewRequest, ContextSourcePreview } from '@ado/shared';
import type { Db } from '../db';
import { contextPackages, contextPackageReviews, planningTasks } from '../db/schema';
import { taskRevision } from '../runner/taskRevision';
import { LOCAL_OWNER } from '../runner/approvals';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const requestHash = (taskId: string, input: unknown) => hash(JSON.stringify({ taskId, request: ContextPackageCreate.parse(input) }));

/** Immutable reference packages; review cannot grant execution or filesystem permissions. */
export class ContextPackages {
  constructor(private db: Db, private secrets: () => Array<string | undefined> = () => []) {}
  private row(id: string) {
    const row = this.db.select().from(contextPackages).where(eq(contextPackages.id, id)).get();
    if (!row) throw new Error('Context package not found');
    return row;
  }
  get(id: string) { return this.read(id, true); }
  status(id: string) {
    const pkg = this.read(id, false);
    return { packageId: pkg.id, digest: pkg.digest, reviewVersion: pkg.reviewVersion, decision: pkg.review?.decision ?? null, reviewedAt: pkg.review?.recordedTs ?? null, freshness: 'not_checked' as const };
  }
  private read(id: string, checkSecrets: boolean) {
    const row = this.row(id), payload = ContextPackagePayload.parse(JSON.parse(row.payloadJson));
    const source = payload.source;
    if (hash(row.payloadJson) !== row.digest || payload.id !== id || source.taskId !== row.taskId || source.taskVersion !== row.taskVersion || source.checkoutId !== row.checkoutId || source.baseSha !== row.baseSha) throw new Error('Stored context package integrity check failed');
    if (source.files.reduce((total, f) => total + f.bytes, 0) !== source.totalBytes || source.totalBytes > 65536 || source.files.length > 16 || source.files.some(f => f.bytes > 16384 || Buffer.byteLength(f.text, 'utf8') !== f.bytes || hash(f.text) !== f.sha256)) throw new Error('Stored context source integrity check failed');
    if (checkSecrets && source.files.some(f => this.secrets().some(secret => secret && (f.text.includes(secret) || f.path.includes(secret))))) throw new Error('Stored context contains a configured secret; access refused');
    const history = this.db.select().from(contextPackageReviews).where(eq(contextPackageReviews.packageId, id)).orderBy(desc(contextPackageReviews.version)).all();
    if (history.some((r, i) => r.version !== history.length - i || r.digest !== row.digest || !['approved_for_context', 'revoked'].includes(r.decision) || r.actorId !== LOCAL_OWNER)) throw new Error('Stored context review history is invalid');
    if (checkSecrets && history.some(r => this.secrets().some(secret => secret && r.reason.includes(secret)))) throw new Error('Stored context review contains a configured secret; access refused');
    return { id, digest: row.digest, createdTs: row.createdTs, payload, reviewVersion: history[0]?.version ?? 0, review: history[0] ?? null, history, freshness: 'not_checked' as const };
  }
  replay(taskId: string, input: unknown) {
    const request = ContextPackageCreate.parse(input);
    const row = this.db.select().from(contextPackages).where(eq(contextPackages.id, request.id)).get();
    if (!row) return undefined;
    if (row.requestHash !== requestHash(taskId, request)) throw new Error('Context package request identity was already used with different content');
    return this.get(row.id);
  }
  save(taskId: string, input: unknown, preview: ContextSourcePreview) {
    const request = ContextPackageCreate.parse(input), source = ContextSourcePreview.parse(preview);
    return this.db.transaction(() => {
      const existing = this.replay(taskId, request); if (existing) return existing;
      const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, taskId)).get();
      if (!task || task.version !== request.version || source.taskId !== taskId || source.taskVersion !== task.version || source.projectId !== task.projectId || source.repositoryId !== task.repositoryId || source.checkoutId !== request.checkoutId || source.baseSha !== request.baseSha) throw new Error('Context package does not match the current task and checkout review');
      if (JSON.stringify(source.files.map(f => f.path)) !== JSON.stringify(request.files.map(f => f.path))) throw new Error('Context package source selection differs from request');
      const taskSnapshotHash = hash(JSON.stringify(taskRevision(this.db, taskId, request.version)));
      const payloadJson = JSON.stringify(ContextPackagePayload.parse({ format: 1, id: request.id, taskSnapshotHash, source }));
      this.db.insert(contextPackages).values({ id: request.id, taskId, taskVersion: request.version, checkoutId: request.checkoutId, baseSha: request.baseSha, requestHash: requestHash(taskId, request), digest: hash(payloadJson), payloadJson, createdTs: new Date().toISOString() }).run();
      return this.get(request.id);
    });
  }
  review(id: string, input: unknown, fresh?: ContextSourcePreview) {
    const request = ContextPackageReviewRequest.parse(input);
    if (this.secrets().some(secret => secret && request.reason.includes(secret))) throw new Error('Context review contains a configured secret; refused');
    return this.db.transaction(() => {
      const pkg = this.read(id, request.decision === 'approved_for_context');
      const replay = this.db.select().from(contextPackageReviews).where(eq(contextPackageReviews.id, request.id)).get();
      if (replay) {
        if (replay.packageId !== id || replay.version !== request.version + 1 || replay.digest !== request.digest || replay.decision !== request.decision || replay.reason !== request.reason) throw new Error('Context review identity was already used with different content');
        return this.status(id); // latest state, never an old approval that could hide a later revocation
      }
      if (pkg.digest !== request.digest || pkg.reviewVersion !== request.version) throw new Error('Context package or review changed; reload before deciding');
      if (request.decision === 'approved_for_context') {
        const original = pkg.payload.source;
        const task = this.db.select().from(planningTasks).where(eq(planningTasks.id, original.taskId)).get();
        if (!task || task.version !== original.taskVersion || hash(JSON.stringify(taskRevision(this.db, task.id, task.version))) !== pkg.payload.taskSnapshotHash) throw new Error('Task context revision changed; create a new package');
        if (!fresh || fresh.taskId !== original.taskId || fresh.taskVersion !== original.taskVersion || fresh.checkoutId !== original.checkoutId || fresh.baseSha !== original.baseSha || fresh.repositoryId !== original.repositoryId || fresh.projectId !== original.projectId || fresh.files.length !== original.files.length || fresh.files.some((f, i) => f.path !== original.files[i].path || f.sha256 !== original.files[i].sha256 || f.blobId !== original.files[i].blobId)) throw new Error('Context sources changed or were not rechecked; create a new package');
      }
      this.db.insert(contextPackageReviews).values({ ...request, version: request.version + 1, packageId: id, actorId: LOCAL_OWNER, recordedTs: new Date().toISOString() }).run();
      return this.status(id);
    });
  }
}
