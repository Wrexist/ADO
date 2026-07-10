# TASK.md — AI Development OS

Living tracker. Updated every session. Current phase drives what's actionable; `/gate` refuses Phase N+1 while N is open.

**Current phase: 2 — Data core** 🔴 (p0 + p1 passed 2026-07-09; Phase 2 ready — needs `.env` first)

---

## Next (Phase 2 — Data core)
- [ ] `.env` from `.env.example` — **needs Isac**: GitHub PAT (repo + actions:read), `ACC_TOKEN` (`openssl rand -hex 24`), `PROJECT_DIRS`
- [x] **Prompt 2.1 — typed event bus end-to-end** — 11-event zod catalog + shared reducer (`state.ts`, one fold for server snapshot AND web deltas); SQLite (WAL, drizzle migrations: events/samples/snapshots/jobs); event-sourced boot replay; SSE with monotonic ids + snapshot-on-connect + Last-Event-ID gap replay; **security:** Host allow-list on ALL routes (DNS-rebinding), X-ACC-Token on mutations, token-gated SSE, strict CORS, timing-safe compare; Zustand bus store + Live/Reconnecting badge; app-open logging (p2.5 feed); **all direct mock imports deleted from apps/web** (grep = 0; fixtures survive only behind `--demo`); every rendered number now derived from stored events (deltas hidden until snapshots exist — honest). 21/21 tests incl. security + replay
- [ ] Prompt 2.2 — scanner (PROJECT_DIRS walk, git status, ops.yml/TASK.md parse, scoped debounced fs-watch)
- [ ] Prompt 2.3 — GitHub sync (octokit + ETags; Actions → progress; releases → deployments)
- [ ] Prompt 2.4 — sysmon + health checks + stale/offline states + documented System Health formula + app-open logging → `/gate p2-data-core`
- [ ] 🎯 Daily-Driver Milestone, then `/gate p2.5-daily-driver` (opens ≥5 of trailing 7 days) before Phase 3

## Done (Phase 1 — Functional shell) 🟢
- [x] Materialize & organize the locked plan package into the repo (docs/, design/reference/, .claude/, CLAUDE.md, .env.example)
- [x] Author `GOALS.md` (goals, success criteria, non-goals, guardrails, anti-pivot clause)
- [x] Author `ROADMAP.md` (7 phases with gates + rollup into the platform vision)
- [x] Author root `README.md` + doc index; living `TASK.md`
- [x] Scaffold npm-workspaces monorepo skeleton: `apps/web`, `apps/server`, `packages/shared`
- [x] `packages/shared/tokens.ts` from DESIGN_SPEC §tokens; zod event-contract skeleton
- [x] `scripts/verify.sh` (typecheck · lint · test · build); `.gitignore`
- [x] `npm install` and prove `verify.sh` green end-to-end — typecheck (3 workspaces) · test 2/2 · web prod build · server boots on `/health` + SSE `/events`
- [x] **Prompt 0.2 — plan council** — 3 adversarial reviewers ran; findings merged into `docs/COUNCIL.md` (6 blockers + 1 elevated security should-fix + 9 should-fix/note)
- [x] **Decisions D1–D3 locked & amendments folded in** — value-first · defer analyzer, keep run logger · View B full 1:1. Updated `.claude/ops.yml` (value-first gates incl. new p2.5/p3.5, p5 parked), `ROADMAP.md`, `GOALS.md`, V3 sections in MASTER_PLAN/DESIGN_SPEC/DATA_MAP/PROMPTS, and the roadmap artifact
- [x] **Prompt 0.3 — per-view mock-data module** — `packages/shared/src/mock` (types + view-a + view-b fixtures, real project names, per-view illustrative numbers, frozen MOCK_NOW clock = future `--demo` seed; 7 consistency tests incl. B1-divergence, S3 radial denominator, S1 non-happy states)
- [x] **Gate `p0-foundation` → PASSED 2026-07-09** — verify green (typecheck ×3, 9/9 tests, prod build), tokens spec-tested, per-view mocks typed, council done with D1–D3 locked
- [x] Screenshot tooling: `scripts/screenshot.mjs` (1536px, both views) + standing instruction recorded as CLAUDE.md convention 14

## Open (not gate-blocking)
- [ ] Create `.env` from `.env.example` (GitHub PAT: repo + actions:read · ACC token: `openssl rand -hex 24`) — needed before Phase 2 data core, not for Phase 1

## Done (Phase 1 details)
- [x] **Prompt 1.0 — shared component kit** — `apps/web/src/kit`: 17 components (Card, IconTile, StatusDot, Chip, GradientProgress, custom SVG Sparkline/RadialRing/MiniArea, AvatarStack, SectionHeader, StatCard, FeedRow, AgentTile, EmptyState, Icon set) + `/kit` demo route with **every state incl. failure/idle/empty/degraded** (opaque agent, tokens-unavailable, collecting-data lines). Inter self-hosted via @fontsource
- [x] **Prompt 1.1 — View A chrome** — top bar (⌘K focuses search, bell badge, presence avatar) + full sidebar (all groups/items/badges from mock counts) + 3-column shell; main/rail regions are honest placeholders
- [x] **Prompt 1.2 — View A main column** — header row (+ layout toggles, + New), 4 stat cards, working repo filter tabs + 3×2 grid (RepoCard: status, meta, gradient progress, agent stacks), view-all bar, Running Agents strip (5 tiles, per-tone bars)
- [x] **Prompt 1.3 — View A right rail** — AI Command Center (input + send), Recent Activity (6 fixture-iconed rows), System Status (dotAfter rows), violet help card. Kit grew: Button, PillTabs, StatusDot dotAfter — all demoed on /kit
- [x] **Prompt 1.4 — View B (`/ops`) full build** — TopBarB + SidebarB (+ Pro Plan card), 5 stat cards (radial w/ denominator, real-series sparklines, tinted health), Projects Overview (working tabs, language dots from tokens, status chips), Build Queue (reserved duration slots, honest "Queued"), Activity Feed, AI Agents roster (idle state), AI Assistant panel, System Monitor (responsive MiniAreas), Quick Actions, Recent Deployments
- [x] **Prompt 1.5 — quality floor** — 0 console errors (enforced by `scripts/screenshot.mjs` on every capture), ⌘K focuses search in BOTH top bars, `:focus-visible` ring global, reduced-motion honored, live values in reserved tabular slots
- [x] **Gate `p1-functional-shell` → PASSED 2026-07-09** (the 1:1 pixel sign-off lives at **p3.5-pixel-polish**, after real data — value-first, D1)

---

## Decisions log
- 2026-07-07: plan v2 locked after 3-pass audit (see `AUDIT.md`). Canonical viewport 1536. View B descope lever named. Kill criterion accepted.
- 2026-07-09: project kickoff. Repo restructured — `Plan_codex` → `docs/VISION_ADO.md`; source zip archived to `docs/archive/`; plan package materialized into `docs/`, `design/reference/`, `.claude/`. `GOALS.md` + `ROADMAP.md` authored as the goals-and-phases foundation. Phase 0 monorepo skeleton scaffolded.
- 2026-07-09: Prompt 0.2 council run (see `docs/COUNCIL.md`). Decisions **D1 value-first**, **D2 defer analyzer / keep run logger**, **D3 View B full 1:1**. Plan restructured value-first: 1:1 pixel-match moved to new `p3.5`, enforced `p2.5-daily-driver` off-ramp added before the expensive phases, `p5-self-learning` parked (un-park at ≥100 runs), SSE/DNS-rebinding exfil elevated to a hard p2 criterion.
- 2026-07-09: **p0-foundation passed.** Standing instruction from Isac: every UI-changing turn ends with progress screenshots of both views sent for visual review (CLAUDE.md convention 14, `scripts/screenshot.mjs`).

## Blocked
- (none) — Phase 0 scaffold verified green. `npm audit` reports dev-dependency advisories (vite/esbuild chain); triaged in Phase 6 hardening, not blocking.

## Notes
- Terminal-started Claude sessions are **not** live-tracked in v1 (honest limitation; token parsing only).
- Billing / Team / Templates / Secrets render as honest "not wired yet" pages — no fake features.
