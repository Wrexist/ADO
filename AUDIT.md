# AUDIT.md — plan review v2 (three adversarial passes)

Every finding is patched in this package (✅), or explicitly accepted as a risk (⚠️ with reason). Severity: **B** = would have caused real failure, **S** = should fix, **N** = note/accepted.

## Pass 1 — Frontend engineer

| # | Finding | Fix |
|---|---|---|
| B2 | **No shared component kit.** Two views built separately will drift (two StatCards, two progress bars, two feed rows) — 2× maintenance for 1 user and the 1:1 match rots on every change | ✅ New Prompt 1.0: build the kit first (Card, StatCard, GradientProgress, StatusDot, Chip, FeedRow, AgentTile, Sparkline, RadialRing, SectionHeader, IconTile, AvatarStack); both views compose from it only. Gate p1 updated |
| S1 | **"1:1" has no defined viewport.** The references are ~1536px desktop shots; without a canonical width the match is unjudgeable | ✅ Canonical viewport 1536, graceful to 1280, horizontal scroll below. Mobile explicitly out of scope v1 (you build at a desk; a fake-responsive dashboard is wasted days) |
| S2 | **No chart decision.** Sparklines/radials/mini-areas via recharts = heavy dependency that won't match the reference look | ✅ Custom SVG components in the kit (≈60 lines each), zero chart deps |
| S10 | **1:1 match can silently regress** after sign-off as later phases touch components | ✅ Phase 6: Playwright screenshot baselines captured at your Phase-1 sign-off; visual diff in verify |
| N | Inter must be self-hosted (@fontsource) — local-first means it must render offline | ✅ folded into Prompt 1.0 |

## Pass 2 — Infra & security engineer

| # | Finding | Fix |
|---|---|---|
| B1 | **The nightly analyzer will silently never run.** It's scheduled for 03:00 on a laptop that sleeps at 03:00. The self-learning loop — the headline feature — dies quietly on day one | ✅ Catch-up scheduler: every job stores last-run; on server boot anything overdue (>20h) runs immediately. Plus Phase 6 autostart (launchd/pm2) so the server itself survives reboots |
| B3 | **Localhost ≠ safe.** Any malicious webpage you visit can fire POSTs at 127.0.0.1 (DNS-rebinding / localhost CSRF) — and your server has an endpoint that *spawns agents with repo write access*. This was a real hole | ✅ All mutating endpoints require an `X-ACC-Token` header (shared secret from .env); strict CORS to the web app origin; SSE read-only. Gate p2 criterion added |
| B5 | **Hard dependency on unstable interfaces.** `claude -p` stream-json and session-log formats are undocumented and change between Claude Code releases; parsed directly, any update breaks the agents panel and token card | ✅ Versioned adapter layer with graceful fallback: unknown format → agent shows honest "running (opaque)" state and tokens show "unavailable" instead of crashing or guessing |
| S4 | **Run-log loss kills the learning loop.** No migrations/backup story for SQLite; the run history IS the asset | ✅ WAL mode, drizzle migrations from Phase 2, nightly db-file copy (keep 7) |
| S5 | GitHub polling burns rate limit at 20+ repos | ✅ Conditional requests (ETags) — 304s are free; backoff already planned |
| S6 | Scanner assumed one PROJECTS_DIR; your repos may be scattered | ✅ `PROJECT_DIRS` = comma-separated list |
| S8 | **Prompt injection via logged content.** The analyzer reads logs containing external text (App Store reviews, README content, agent output). Injected instructions could shape proposals; same for review text flowing into TASK.md via schedules | ✅ Explicit rule: analyzer and all agents treat quoted/external text strictly as data; proposals are diffs requiring your approval (already) — now stated as a security invariant, not just workflow |
| S12 | Spawned agents inherited the dashboard's full env (GitHub token, Anthropic key) | ✅ Runner passes a minimal env allow-list |
| N | SQLite sync driver in Fastify | ⚠️ fine at this scale with WAL; revisit only if event volume proves it wrong |

## Pass 3 — Skeptical solo-dev advisor

| # | Finding | Fix |
|---|---|---|
| B4 | **Phase 5 will learn from noise.** The analyzer needs volume; with a handful of logged runs it will confidently propose slop — violating its own founding rule | ✅ Entry precondition on gate p5: ≥ 25 logged runs. If usage is thinner than that, the learning phase waits — by design |
| S11 | **No time-to-value milestone and no kill switch.** First daily utility lands at Phase 3; a dashboard nobody opens is procrastination with a UI | ✅ Daily-Driver Milestone: after Phase 2 this must replace your manual repo/CI checking. Kill criterion: if 7 days after Phase 3 you haven't opened it daily, stop before Phase 5 and reassess — the run log will prove it either way |
| S7 | Dashboard only informs while open — failed builds/blocked gates/proposals go unseen for hours | ✅ Prompt 4.3: macOS notifications (node-notifier) for failed build, blocked gate, new proposal. Cheap, disproportionate value |
| S9 | Package referenced TASK.md and .env but shipped neither | ✅ Starter TASK.md and .env.example added |
| N | View B doubles UI work for one user | ⚠️ kept — you explicitly want both screens. Named descope lever: if Phase 1 exceeds 3 days, View B ships after Phase 2 instead of blocking it |
| N | 3 weeks part-time is optimistic with 3 other open gates | ⚠️ accepted; the anti-pivot clause + Friday sweeper are the mitigation, and the estimate is honest, not padded |

## Net effect

5 blocking findings existed. B1 and B3 are the ones that would have hurt most — a learning loop that never fires and an agent-spawning endpoint reachable by any webpage. Both are now closed in the specs, gates, and prompt sequence (see V2_CHANGES in each file).
