# LEARNINGS.md

One line per learning. The nightly analyzer (parked, p5) consumes this file; keep entries terse and factual.

- 2026-07-12: Per-model prompt tuning is cheaply done as a preamble + optional per-model variant over one shared `body` — avoids duplicating every prompt per AI while still shaping output for the selected model.
- 2026-07-12: Specialized "agents" are best modeled as dispatch profiles (system preamble + verifiable loop + exit check), not new runtime types — they compose with existing prompts via a render helper and need no runner changes.
- 2026-07-12: Custom user data (prompts) follows the same secure pattern as secrets — gitignored JSON under data/, token-gated CRUD, built-ins served from the client bundle so the API payload stays small.
- 2026-07-12: The catch-up scheduler must NOT advance a job's last-run on failure, or a failing nightly job silently marks itself done and never retries; only a clean run persists the timestamp.
- 2026-07-12: Sub-minute samplers (sysmon 10s, health 60s) should stay on naked intervals — a missed 10s sample is meaningless, so persisting last-run for them is pure overhead; the scheduler is for catch-up-worthy daily/hourly work.
- 2026-07-12: WAL-safe backup = `VACUUM INTO` (not a file copy) + reopen-and-assert row count before rotation; a silent short-write must fail loudly rather than leave a corrupt "backup".
- 2026-07-12: Vitest path filters are resolved from the repo root (where the config lives), not the `-w` workspace cwd — filter with `apps/server/src/...` from root, not `src/...`.
- 2026-07-12: The dashboard already holds at 53 repos with no layout break because both views cap their lists (View A grid at 6, View B table at 5, each + "View all") — capping list widgets defensively pays off at scale for free.
- 2026-07-12: Pixel-diff visual baselines should wait until after the pixel-polish sign-off (p3.5) or they just get re-baselined by the polish; a render + zero-console-error smoke gate gives regression coverage in the meantime without that churn.
- 2026-07-12: launchd starts with a minimal PATH, so a LaunchAgent must invoke the app via a login shell (`/bin/sh -lc`) to pick up node/nvm — running `node` directly from a plist fails after reboot.
- 2026-07-12: The server has no JS build (runs via tsx), so autostart (pm2/launchd) invokes `npm run start -w @ado/server` rather than a compiled entrypoint.
- 2026-07-12: A stable event id is correct ONLY for create-once/idempotent facts; for anything whose value changes over time (scanner rescans, GitHub PR/CI enrichment) a stable id makes the bus dedup silently drop every update — use a fresh id per emit and let the reducer merge.
- 2026-07-12: EventSource can't set headers, so the SSE token rides the URL; the default request logger serializes req.url and writes the secret to disk — redact `token=` in a req serializer (header tokens are safe).
- 2026-07-12: A concurrency-slot decrement must live in `finally`, not after the last await — otherwise one throw both leaks the slot forever and becomes an unhandledRejection (the run was launched with `void`).
- 2026-07-12: Trend deltas stay honest by storing daily snapshots as events and computing current − baseline; no history → no delta. Boot captures before the async scan finishes, so re-capture post-scan (unique id + last-write-per-day-wins in the reducer) to correct day one.
