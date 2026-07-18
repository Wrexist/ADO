/**
 * Workflow catalog types — the shape the app uses to VISUALISE the `.claude/workflows/*.js`
 * orchestration recipes. The recipes themselves run in Claude Code, not the app; the server
 * reads each file's `meta` block at runtime and serves it here so the visual can never drift
 * from the real files (no hand-maintained copy to fall out of date). PRESENTATION only.
 */
import { z } from 'zod';

export const WorkflowPhase = z.object({
  title: z.string(),
  detail: z.string().optional(),
});
export type WorkflowPhase = z.infer<typeof WorkflowPhase>;

export const WorkflowMeta = z.object({
  /** e.g. "review" */
  name: z.string(),
  description: z.string(),
  /** the recipe's own `meta.whenToUse` guidance, if it declares one */
  whenToUse: z.string().optional(),
  phases: z.array(WorkflowPhase),
  /** source file basename, e.g. "review.js" — proves it maps to a real file */
  file: z.string(),
});
export type WorkflowMeta = z.infer<typeof WorkflowMeta>;
