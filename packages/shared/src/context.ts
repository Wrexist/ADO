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
  checkoutId: z.string().uuid(), baseSha: z.string(), observedTs: z.string(), executionEnabled: z.literal(false),
  status: z.enum(['unreviewed', 'review_required']), authority: z.literal('reference_only'),
  totalBytes: z.number().int().nonnegative(), maxBytes: z.number().int().positive(),
  files: z.array(z.object({ path: z.string(), blobId: z.string(), sha256: z.string(), bytes: z.number().int().nonnegative(), text: z.string(), comparison: z.enum(['not_supplied', 'matches_supplied_hash', 'differs_from_supplied_hash']) })),
});
export type ContextSourcePreview = z.infer<typeof ContextSourcePreview>;
