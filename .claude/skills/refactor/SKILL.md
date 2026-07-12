---
name: refactor
description: Behavior-preserving cleanup — extract duplication, rename, reduce nesting, dedupe — with tests as the safety net. Use when asked to clean up, simplify, or DRY code without changing behavior.
---

# Refactoring here

- **Behavior must not change.** Rely on existing tests; if coverage is thin, add characterization tests FIRST, then refactor.
- **Match the surrounding code** — comment density, naming, idioms. Read like the neighbours.
- **Small, reviewable diffs.** One concern at a time. Prefer stripping undefined + merging over special-casing (see the enrichment-safe `repo.upserted` reducer).
- **Kill dead code** (unused exports/props/fields) — ESLint `no-unused-vars` + a grep confirm nothing references it. Consolidate duplicated logic into one shared helper (selectors, `cwdFor`, the `useCmdK`/palette pattern).
- **No new dependencies** without a reason.
- **Single source for shared types:** define a zod enum once and infer the TS type; don't hand-maintain a parallel union (see `Tone`, `PromptCategoryEnum`).
- Report what changed and why it's safe. `npm run verify` green.
