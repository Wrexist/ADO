import { z } from 'zod';

export const ContextPreviewRequest = z.object({
  version: z.number().int().positive(), checkoutId: z.string().uuid(),
  baseSha: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
  files: z.array(z.object({ path: z.string().min(1).max(240), expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()).min(1).max(16)
    .refine(files => new Set(files.map(f => f.path)).size === files.length, 'Choose each file once'),
}).strict();
export type ContextPreviewRequest = z.infer<typeof ContextPreviewRequest>;
export const ContextSourcePreview = z.object({
  taskId: z.string().uuid(), taskVersion: z.number().int().positive(), projectId: z.string().uuid(), repositoryId: z.string().uuid(),
  checkoutId: z.string().uuid(), baseSha: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/), observedTs: z.string(), executionEnabled: z.literal(false),
  status: z.enum(['unreviewed', 'review_required']), authority: z.literal('reference_only'),
  totalBytes: z.number().int().nonnegative().max(65536), maxBytes: z.literal(65536),
  files: z.array(z.object({ path: z.string(), blobId: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative().max(16384), text: z.string(), comparison: z.enum(['not_supplied', 'matches_supplied_hash', 'differs_from_supplied_hash']) })).min(1).max(16),
});
export type ContextSourcePreview = z.infer<typeof ContextSourcePreview>;
export const ContextPackageCreate = ContextPreviewRequest.extend({ id: z.string().uuid() });
export const ContextPackageReviewRequest = z.object({ id: z.string().uuid(), version: z.number().int().nonnegative(), digest: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['approved_for_context', 'revoked']), reason: z.string().trim().min(1).max(2000) }).strict();
export const ContextPackagePayload = z.object({ format: z.literal(1), id: z.string().uuid(), taskSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/), source: ContextSourcePreview }).strict();
export const ContextExecutionBinding = z.object({ id: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/), reviewVersion: z.number().int().positive() }).strict();
export type ContextExecutionBinding = z.infer<typeof ContextExecutionBinding>;
export const ContextReview = z.object({ id: z.string().uuid(), packageId: z.string().uuid(), version: z.number().int().positive(), digest: z.string(), decision: z.enum(['approved_for_context', 'revoked']), reason: z.string(), actorId: z.string(), recordedTs: z.string() });
export const ContextPackageRecord = z.object({ id: z.string().uuid(), digest: z.string(), createdTs: z.string(), payload: ContextPackagePayload, reviewVersion: z.number().int().nonnegative(), review: ContextReview.nullable(), history: z.array(ContextReview), freshness: z.literal('not_checked') });
export type ContextPackageRecord = z.infer<typeof ContextPackageRecord>;
export const ContextPackageStatus = z.object({ packageId: z.string().uuid(), digest: z.string(), reviewVersion: z.number().int().nonnegative(), decision: z.enum(['approved_for_context', 'revoked']).nullable(), reviewedAt: z.string().nullable(), freshness: z.literal('not_checked') });
/**
 * T11: how the package relates to what a run would start from now. Anything but `current`
 * needs a new package; an earlier approval is history, not a fresh check.
 */
export const ContextRecheck = z.enum(['current', 'base_moved', 'task_changed', 'checkout_unknown']);
export type ContextRecheck = z.infer<typeof ContextRecheck>;
export const ContextPackageSummary = ContextPackageStatus.extend({ taskVersion: z.number().int().positive(), checkoutId: z.string().uuid(), baseSha: z.string(), createdTs: z.string(), recheck: ContextRecheck.optional() });
export const ContextPackageList = z.object({ packages: z.array(ContextPackageSummary), nextCursor: z.string().uuid().nullable() });
export type ContextPackageSummary = z.infer<typeof ContextPackageSummary>;
