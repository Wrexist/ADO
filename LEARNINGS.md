# LEARNINGS.md

One line per learning. The nightly analyzer (parked, p5) consumes this file; keep entries terse and factual.

- 2026-07-12: Per-model prompt tuning is cheaply done as a preamble + optional per-model variant over one shared `body` — avoids duplicating every prompt per AI while still shaping output for the selected model.
- 2026-07-12: Specialized "agents" are best modeled as dispatch profiles (system preamble + verifiable loop + exit check), not new runtime types — they compose with existing prompts via a render helper and need no runner changes.
- 2026-07-12: Custom user data (prompts) follows the same secure pattern as secrets — gitignored JSON under data/, token-gated CRUD, built-ins served from the client bundle so the API payload stays small.
- 2026-07-12: The catch-up scheduler must NOT advance a job's last-run on failure, or a failing nightly job silently marks itself done and never retries; only a clean run persists the timestamp.
- 2026-07-12: Sub-minute samplers (sysmon 10s, health 60s) should stay on naked intervals — a missed 10s sample is meaningless, so persisting last-run for them is pure overhead; the scheduler is for catch-up-worthy daily/hourly work.
- 2026-07-12: WAL-safe backup = `VACUUM INTO` (not a file copy) + reopen-and-assert row count before rotation; a silent short-write must fail loudly rather than leave a corrupt "backup".
- 2026-07-12: Vitest path filters are resolved from the repo root (where the config lives), not the `-w` workspace cwd — filter with `apps/server/src/...` from root, not `src/...`.
