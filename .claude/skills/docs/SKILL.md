---
name: docs
description: Write or refresh docs here — README, CLAUDE.md, TASK/LEARNINGS/MEMORY, API notes. Use when documentation is requested or a change makes the docs stale.
---

# Docs here

- **Copy is a single-shot draft (convention 6).** UI copy, README prose, naming — draft once for Isac to edit; do NOT loop on wording. Loops run only on verifiable work (code, tests, data).
- **Verify every command** you write against the actual project (`npm run verify`, `smoke`, `dev`, `--demo`). Never invent features, flags, or benchmarks.
- **Keep counts honest.** When you change a catalog, update the stated counts (connectors, prompts, routes) — stale numbers are a bug.
- **The living files:** `TASK.md` (done / next, per phase), `LEARNINGS.md` (one line per learning — the nightly analyzer consumes it), `MEMORY.md` (cross-session shift log). Update them each session.
- **Gate docs** live in `.claude/ops.yml`; phase status is honest (open / passed with a dated note). Don't mark a gate passed you can't machine-check.
