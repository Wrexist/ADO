---
name: testing
description: Write meaningful tests here — vitest unit/integration + the Playwright --demo smoke. Use when adding a feature, fixing a bug, or covering an untested path.
---

# Testing here

- **Runner:** `vitest` (config at repo root; env `node`). Run all: `npm test`; focused: `npx vitest run apps/server/src/<area>`.
- **Assert behavior, not implementation.** Cover the happy path, boundaries, error paths, and the one thing most likely to regress. A bug fix ships WITH the test that would have caught it (see the runner slot-leak, builds-cap, and stat-delta tests).
- **Determinism.** Inject the clock (`now`) and fakes (fake Spawner, fake GitHubClient, `:memory:` db). No real time/network. For same-millisecond races, use monotonic ids.
- **Teardown.** Drain async work before closing a `:memory:` sqlite (`await new Promise(r=>setTimeout(r,30))`) so run()/dispatch don't outlive the handle.
- **Visual gate:** `npm run smoke` boots the deterministic `--demo` seed, screenshots the three main routes, and FAILS on any console error. Pixel-diff baselines wait for the p3.5 sign-off.
- Green means `npm run verify` green (typecheck · lint · test · build) — not just the one file.
