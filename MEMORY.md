# MEMORY.md — cross-session shift log

Handoff notes between working sessions (human or agent). Newest first. Complements:
- `TASK.md` — what's done / next, per phase
- `LEARNINGS.md` — one durable lesson per line (the nightly analyzer consumes it)
- `.claude/logs/` — raw tool + session logs (gitignored)

Each entry: date · who · what shipped · what's next / watch-outs.

---

## 2026-07-12 · Claude · workflows + CI
- Added `.claude/workflows/` — six opt-in orchestration recipes (Claude Code Workflow scripts):
  `understand` (parallel cited map), `ship-feature` (map → judge-panel design → vetted plan),
  `review` (diff, adversarial-verify per finding), `audit` (whole-repo sweep → dedupe → verify →
  fix list), `harden` (loop-until-dry hunt, 3-lens majority vote), `verify-gate` (verifier agent
  runs verify+smoke ∥ convention audit ∥ completeness critic → pass/block). Each lens IS a
  CLAUDE.md convention; every finding must survive an agent trying to refute it. `README.md` documents them.
- Added `.github/workflows/ci.yml` — mirrors the local gate (`npm run verify`) on PR + main push;
  Node 20 floor, `permissions: contents: read`, `npm ci` from lockfile, cancel-in-progress. Smoke
  stays local (needs ACC_TOKEN + browser); CI doesn't fabricate a pass it can't run.
- Validated all six scripts compile in the harness's async-function context (not `node --check`,
  which wrongly rejects the top-level `return`/`await` the harness wraps) and lint clean; ci.yml YAML parses.
- **Next / watch-outs:** workflows are authoring-only so far — none executed (no multi-agent opt-in
  given this round). First real run should be `review` on a diff to confirm the fan-out + verify pass end-to-end.

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
