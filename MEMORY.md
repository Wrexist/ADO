# MEMORY.md — cross-session shift log

Handoff notes between working sessions (human or agent). Newest first. Complements:
- `TASK.md` — what's done / next, per phase
- `LEARNINGS.md` — one durable lesson per line (the nightly analyzer consumes it)
- `.claude/logs/` — raw tool + session logs (gitignored)

Each entry: date · who · what shipped · what's next / watch-outs.

---

## 2026-07-12 · Claude · LOOPKIT harness adopted
- Adopted the LOOPKIT `.claude/` harness, tailored to this repo: `settings.json`
  (permissions + hooks), `hooks/` (pre/post/stop "reflexes", fail-open), `agents/verifier.md`
  (independent shift-notes cop), `skills/` (9 tracks: agent-llm, debug, security, frontend,
  testing, refactor, docs, data, git-ops), root `.mcp.json`, this `MEMORY.md`, `run.sh`,
  `install.sh`. Existing `.claude/ops.yml` + root `CLAUDE.md` were preserved.
- Earlier same-day rounds: audit-and-fix (real bugs — SSE token-leak to logs, runner
  slot-leak, scanner/GitHub stale-id dedup, unbounded builds); dead-nav clearout (real
  `/repositories` `/agents` `/deployments` `/activity` pages + `/planned/:slug` placeholders +
  a ⌘K command palette); real ESLint gate; event-sourced stat-card trend deltas; Tone enum +
  timestamp validation; dropped the `snapshots` table + boot event-log compaction; and every
  remaining chrome interaction wired (layout/sort toggles, row menus, top-bar icons).
- **Next / watch-outs:** `p2.5` (one week of real daily use) + `p3` (a real `claude -p` run) are
  Isac's to close; `p3.5` pixel-diff baselines wait for the visual sign-off. Turn real
  `/planned/*` placeholders into features as prioritized.

---

## Template — copy for each session
## YYYY-MM-DD · who · title
- shipped: …
- next / watch-outs: …
