/**
 * Mock-data module (Prompt 0.3) — per-view typed fixtures for every DESIGN_SPEC widget.
 *
 * These are FIXTURES, clearly marked — nothing here is real portfolio data:
 * - Per-view: the two reference images carry different illustrative numbers (council B1),
 *   so each view has its own values; the SHAPES are what Phase 1 builds against.
 * - Deterministic by construction (no Date.now / Math.random; frozen MOCK_NOW clock) —
 *   this module doubles as the frozen --demo seed the P3.5 visual baselines render.
 * - Post-Phase-2 rule: components stop importing '@ado/shared/mock' (grep must hit zero
 *   in apps/web); the module survives only behind the --demo seed flag.
 */
export * from './types';
export { MOCK_VIEW_A } from './view-a';
export { MOCK_VIEW_B } from './view-b';

/** Every consumer can (and tests do) assert it is knowingly rendering fixtures. */
export const FIXTURE = true as const;
