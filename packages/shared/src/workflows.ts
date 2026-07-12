/**
 * Workflow catalog types — the shape the app uses to VISUALISE the `.claude/workflows/*.js`
 * orchestration recipes. The recipes themselves run in Claude Code, not the app; the server
 * reads each file's `meta` block at runtime and serves it here so the visual can never drift
 * from the real files (no hand-maintained copy to fall out of date). PRESENTATION only.
 */

export interface WorkflowPhase {
  title: string;
  detail?: string;
}

export interface WorkflowMeta {
  /** e.g. "review" */
  name: string;
  description: string;
  /** the recipe's own `meta.whenToUse` guidance, if it declares one */
  whenToUse?: string;
  phases: WorkflowPhase[];
  /** source file basename, e.g. "review.js" — proves it maps to a real file */
  file: string;
}
