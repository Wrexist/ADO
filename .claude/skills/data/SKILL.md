---
name: data
description: Work with the event-sourced data layer — zod event contracts, the shared reducer, SQLite/drizzle, migrations. Use when adding an event, a stat, a table, or touching server↔web data flow.
---

# Data here (event-sourced)

- **One typed event catalog.** Every server→client value is a zod event in `packages/shared/src/events.ts`, validated at BOTH ends. No `any` in payloads. New event → add it to the discriminated union AND a `reduce()` case in `state.ts`.
- **The reducer is shared + pure.** Server snapshot and web deltas fold through the same `reduce()`. Merges are additive (strip undefined so one source never clobbers another's enrichment). New collections are CAPPED (samples 360, activity 100, deployments 50, builds 100).
- **No fabricated numbers.** Deltas/trends come from stored history (`stats.snapshot` daily rollups); no history → no delta. Latest-only signals (health/tokens/stats) are compacted on boot so the log stays bounded.
- **SQLite + drizzle.** WAL mode. NEVER edit an applied migration's SQL (breaks the hash) — add a new migration file + journal entry. Backups use `VACUUM INTO` + a row-count assert, never a raw file copy under WAL.
- **Ids matter.** A stable id is for create-once/idempotent facts only; anything whose value changes over time needs a fresh id per emit, or the bus dedup silently drops the update.
