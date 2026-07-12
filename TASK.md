# TASK.md — AI Development OS

Living tracker. Updated every session. Current phase drives what's actionable; `/gate` refuses Phase N+1 while N is open.

**Current phase: 6 — Hardening** 🔴 (p0/p1/p2/p3(sim)/p4 passed; p2.5 real-usage gate + p3 real-claude confirmation pending Isac; p5 parked. Phase 4 command center done; Phase 6 in progress — Prompt Library + optimized loops + WAL-safe backup landed)

---

## Done (Phase 6 — Prompt Library + optimized loops + hardening)
- [x] **Prompt Library — model-optimized catalog** (`@ado/shared/prompts`): 26 curated, production-grade prompts heavy on **games / mobile / Steam / apps** (+ web/backend/testing/perf/security/refactor/docs/devops), 12 categories. Each prompt has a general `body` + optional per-model `variants`; `renderPrompt(p, model)` prepends a per-model **tuning preamble** (Claude/GPT/Gemini) and picks the best body — so the same prompt comes out **shaped for the selected AI** without duplicating every entry. No-fabrication respected (copy/marketing prompts flagged single-shot drafts, `dispatchable:false`).
- [x] **Trained specialized agents** (`@ado/shared` AGENTS): Game Developer, Mobile Developer, Steam Release Engineer, App Feature Builder — each a dispatch profile with a **system preamble (the training)**, recommended model, and an explicit **verifiable loop + exit check** (convention 6: loops run only on checkable work). `renderAgentDispatch(agent, prompt, model)` wraps a paired prompt with the preamble + loop so the runner **iterates against the exit check** instead of one-shotting.
- [x] **Custom prompts — easy/clean/smooth add** — server `PromptStore` (gitignored `data/prompts.json`, same trust model as connections) with zod-validated CRUD (`CustomPromptInput` shared schema); token-gated `GET/POST/DELETE /api/prompts` (a user's prompts aren't world-readable; built-ins ship in the client bundle). `/prompts` page: trained-agents strip, model selector (Any/Claude/GPT/Gemini → live "optimized for" rendering), category chips w/ counts, search, per-card **Copy / Preview / Run in repo** (dispatches the rendered text to a scanned repo), and inline **New/Edit/Delete** for custom entries. Nav wired in both sidebars (View A "Prompt Library", View B "Prompts").
- [x] **Optimized loops — catch-up scheduler** (`scheduler/`, convention 13): jobs-table-backed, **last-run persisted**, **overdue jobs fire on boot** (a laptop asleep past a nightly job still gets one on wake); injectable clock for tests; a failing job doesn't advance its clock (retries) and never crashes the scheduler; timers unref'd. Token rollup migrated onto it (`runOnBoot`); sub-minute samplers stay on their own intervals by design.
- [x] **P6 — WAL-safe nightly backup** (`backup/`): `VACUUM INTO` (consistent snapshot incl. WAL — a raw copy under WAL corrupts), **reopens the copy and asserts the event row-count matches** the source (fails loudly + deletes a bad copy), then **7-copy rotation**. Registered as a daily scheduled job (true catch-up: only fires if a day elapsed).
- [x] **Verify green** — typecheck ×3 · lint · 64/64 tests (added scheduler ×5, backup ×3, prompt-store ×5, prompt-API ×3) · build. Zero console errors on `/command`, `/ops`, `/prompts` at 1536px.
- [ ] **P6 remaining** (still `open`): Playwright visual baselines wired into verify; launchd/pm2 autostart; README quickstart pass; 50-repo scale render check.

---

## Done (Phase 4 — Command center)
- [x] **Prompt 4.1 — NL command box → intent → action** — `@ado/shared/intents` (5 intents + kind); server `HeuristicParser` (works with no key; Claude-backed parser is a drop-in behind the `IntentParser` seam when the Anthropic key is connected); `respond()` executes read intents now (status_query/summarize_activity/run_gate — deterministic answers from bus state), returns a **preview for mutating intents** (create_task writes TASK.md, dispatch_task spawns an agent) that only run on explicit **Confirm**; `POST /api/command` + `/api/command/execute` (token-gated). Wired into View A AI Command Center + View B AI Assistant (`CommandBox`).
- [x] **Prompt 4.2 — token accounting** — `TokenRollup` sums the run logger's real tokens over a 7-day window → `tokens.rollup` event; AI Tokens card shows `≈` (or honest "tokens unavailable" until runs complete). Terminal-session parsing (versioned adapter) is a later add.
- [x] **Gate `p4-command` → PASSED 2026-07-11** — 5 intents end-to-end with confirm-before-mutate; per-run tokens recorded + shown with ≈. Proven live: "status" → real counts; "add task to sentinel: …" → confirm preview. 51/51 tests.

---

## In progress (Phase 3 — Agents & builds)
- [x] **Prompt 3.1 — runner** — dispatch endpoint (`POST /api/dispatch`, token-gated); spawns `claude -p --output-format stream-json` behind an injectable `Spawner` (minimal env allow-list — no secrets; turn cap; reduced priority); **versioned stream-json adapter** (unknown/garbled → opaque, never crashes/guesses — council B5); dispatch **semaphore** (max 3, backs Build Queue — excess `queued`, council B4) + wall-clock timeout; **cwd allow-list** from scanner (only scanned repos dispatchable — S12); registry = `runs` table, **orphans reconciled to failed on boot**
- [x] **Prompt 3.2 — wiring + run logger** — runner emits `agent.upserted`/`build.updated`/`activity.appended` live; Running Agents strip + Build Queue + Activity Feed all light up from the bus (no new UI needed — views already render from slices); repo gets an agent avatar via `repo.enriched`; **run logger** = the `runs` table (repo, task, model, tokens, duration, turns, verify verdict, human action, exit) — the durable asset for the parked analyzer. 48/48 tests.
- [x] **Proven end-to-end (simulated agent):** dispatched 3 agents → live "Using Grep…" progress (turn-based %), Active Agents 3, Build Queue populated, dispatch activity, run rows logged. Real `claude -p` runs identically (same code path behind the Spawner).
- [ ] **Gate `p3-agents`** — pipeline proven in simulation; the literal "real `claude -p` task to completion" confirmation is Isac's to run on a machine with the claude CLI + a repo. Then `/gate p3-agents`.

## Settings · Connections (Isac request — keys/links for everything)
- [x] **Connector catalog** (`@ado/shared/connectors`): 12 services grouped — Source Control (GitHub), **AI Providers & Subscriptions** (Claude, GPT, Gemini, Ollama-local), Data (Supabase), Deploy (Vercel/Netlify/App Store), Notifications (Slack/Discord), Design (Figma) — each with a direct "Get key ↗" deep-link + honest `wired` flag
- [x] **Secure secrets store** (`connections/store.ts`): gitignored `data/connections.json`, mode 600; stored value overrides `.env` fallback; **secrets never returned to the client** (masked `••••last4` + connected flag only). 5 store tests
- [x] **Token-gated API**: `GET/POST/DELETE /api/connections` (token required on GET too — status isn't world-readable); saving GitHub **connects live** (restarts sync, no server restart); anthropic key picked up on next health tick
- [x] **Settings page** (`/settings`): grouped connector cards — status pill, masked key on file, password field, Connect/Update/Disconnect, per-service "Get key ↗", Active vs "Saved · wiring soon" badges, security note. Sidebars (Secrets/Integrations/Settings) + View B gear all route here; route-aware active state
- [x] Proven: connected services via the API, page renders masked states, zero console errors
- [x] **Expanded to 36 connectors across 10 groups** (Isac: "connect to all necessary softwares… AI subscriptions and so on"): Source (GitHub/GitLab/Bitbucket) · **AI (Claude, GPT, Gemini, Mistral, Grok, Groq, OpenRouter, Hugging Face, Ollama)** · Data (Supabase/Firebase/Neon/PlanetScale/MongoDB/Upstash) · Deploy (Vercel/Netlify/Cloudflare/AWS/Fly/Railway/Render) · Mobile (App Store/Google Play/Expo) · Game Dev (Steam/Unity) · Notifications & Project (Slack/Discord/Telegram/Linear/Notion) · Design (Figma) · Monitoring (Sentry/PostHog) · Payments (Stripe). Each: direct "Get key ↗", masked hint, Connect/Update/Disconnect, honest Active vs "Saved · wiring soon". Added a **filter box** + env-fallback auto-detect for common providers

## Prior phases

---

## Next (Phase 2 — Data core)
- [ ] `.env` from `.env.example` — **needs Isac**: GitHub PAT (repo + actions:read), `ACC_TOKEN` (`openssl rand -hex 24`), `PROJECT_DIRS`
- [x] **Prompt 2.1 — typed event bus end-to-end** — 11-event zod catalog + shared reducer (`state.ts`, one fold for server snapshot AND web deltas); SQLite (WAL, drizzle migrations: events/samples/snapshots/jobs); event-sourced boot replay; SSE with monotonic ids + snapshot-on-connect + Last-Event-ID gap replay; **security:** Host allow-list on ALL routes (DNS-rebinding), X-ACC-Token on mutations, token-gated SSE, strict CORS, timing-safe compare; Zustand bus store + Live/Reconnecting badge; app-open logging (p2.5 feed); **all direct mock imports deleted from apps/web** (grep = 0; fixtures survive only behind `--demo`); every rendered number now derived from stored events (deltas hidden until snapshots exist — honest). 21/21 tests incl. security + replay
- [x] **Prompt 2.2 — scanner** — walks `PROJECT_DIRS` (list, ~ expanded), discovers git repos, reads branch/last-commit/dirty via git CLI (fenced — no throw on empty/detached/no-git), parses `.claude/ops.yml` (category or inferred from stack; blocked-gate → blocked status), `TASK.md` (open-task count), package.json/README (description); emits merge-friendly `repo.upserted` base events (never sets agents/ci — enrichment owns those, new merge reducer + `repo.enriched`); scoped fs-watch (ops.yml/TASK.md only, ignore-list, 2.5s debounce, lstat skips symlinks — council S4). **Proven end-to-end:** scanned 5 real scratch git repos → dashboard rendered them live with correct inferred categories, blocked tower-defense, and honest empty states for everything not-yet-wired. 25/25 tests
- [x] **Prompt 2.3 — GitHub sync** — octokit behind a narrow `GitHubClient` adapter (ETag conditional requests → 304s cost no rate limit); enriches scanner repos by slug (stars, language, PR count, latest Actions run → CI bar per DATA_MAP mapping incl. failed=red), creates GitHub-sourced base repos when no local match (token-only mode), records releases → deployments (idempotent); poll loop with 60s→10m backoff; flips `github` health on failure. Enrich-not-clobber via the merge reducer. `buildServer` gained a DI seam for a fake client. **Proven end-to-end** against a fake GitHub backend + the scanner workspace: 5 scanned repos enriched live — green/amber/red CI bars, language dots, star/PR counts, 2 deployments, Health 85% from the formula. 29/29 tests (pure mappers + enrich/base/idempotent). *(Needs Isac's `GITHUB_TOKEN` for real repos; logic is complete + ready.)*
- [x] **Prompt 2.4 — system layer** — `systeminformation` CPU/mem/net sampled every 10s → live System Monitor mini-areas (samples live in a dedicated table + transient SSE channel, never bloating the event log; re-seeded via snapshot on connect); health checks every 60s (server self-check + anthropic only-if-keyed; runner stays "No data" until P3 — never faked); documented deterministic System Health formula; **honest stale/offline** — kill the server → "Reconnecting — stale" badge + banner ("values are last known, not live"). App-open logging feeds p2.5. 32/32 tests. **Proven live:** real CPU 8%/Mem 7%/Net 0% charts + Health 90%.
- [x] **Gate `p2-data-core` → PASSED 2026-07-11** — the Daily-Driver phase is functionally complete.
- [ ] 🎯 **Daily-Driver Milestone / `p2.5-daily-driver`** — the enforced off-ramp: requires the dashboard opened ≥5 of the trailing 7 real days BEFORE Phase 3 (council B6). Needs real-world usage over a week; cannot be closed in a build session.

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
