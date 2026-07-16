# TASK.md — AI Development OS

Living tracker. Updated every session. Current phase drives what's actionable; `/gate` refuses Phase N+1 while N is open.

**Current phase: 6 — Hardening** 🔴 (p0/p1/p2/p3(sim)/p4 passed; p2.5 real-usage gate + p3 real-claude confirmation pending Isac; p5 parked. Phase 4 command center done; Phase 6 in progress — Prompt Library + optimized loops + WAL-safe backup landed)

---

## Project settings + GitHub flow round (2026-07-16b) — per-project control, polished
Every project gets a **Settings** button with stored feature switches, and the GitHub flow is
one-click end to end (get a repo in · open a PR · jump to the open PR).
- [x] **Shared** (`@ado/shared/projectSettings`): `PROJECT_FEATURES` catalog (agents · autoReview ·
  automations · notifications, each with name/blurb/default) — adding a future feature = one catalog
  row + one `isEnabled` consult; `ProjectSettingsPatch` zod; `ProjectGitInfo` (branch · remote ·
  github ref · newPrUrl · openPr + honest `prState` provenance).
- [x] **Server — switches enforced at real choke points**: `ProjectSettingsStore` (delta-over-default
  JSON). `agents` → Runner `blockedReason` (ONE choke point: command box, prompts, automations,
  incident/review fixes all honor it); `automations` → engine predicate (background triggers sleep;
  a deliberate manual run still works); `notifications` → gated at the notifier call sites (builds,
  deploys, review pings; untagged deploys still fire); `autoReview` → delegates to the AutoReview
  engine/store (single source of truth + baseline seeding). Endpoints: GET/POST
  `/api/projects/:id/settings` (token-gated, zod-validated, 404 unknown).
- [x] **Get a project from GitHub**: `parseGithubRepo` (owner/repo · https · ssh, path/shell-trick
  rejects) + `GithubCloner` — clean https URL in argv, token ONLY via env (`GIT_CONFIG_*`
  extraheader, never in argv/.git/config/errors), `GIT_TERMINAL_PROMPT=0` (never hangs), refuses an
  existing dest, token-free failure copy. `POST /api/projects/github` clones into the tracked
  projects folder → live rescan. UI: Repositories → Add panel gains "…or get it from GitHub".
- [x] **PR flow**: `GET /api/projects/:id/git` reads the CONFIGURED remote (`git config`, immune to
  machine-level insteadOf rewrites), parses the GitHub ref, builds the compare-page `newPrUrl`, and
  — with GitHub connected — fetches the current branch's open PR (`openPrForBranch` added to the
  GitHubClient adapter, ETag-cached). Project page header: **Open PR #n ↗** (primary, when live) or
  **New PR ↗** + **View on GitHub ↗**, with honest no-remote / connect-GitHub states.
- [x] **Web**: ProjectPage Settings gear (auto-open via `?settings=1`) + settings card (per-row save,
  honest errors); ⌘K "Project settings for <repo>" actions; AddProjectPanel clone block.
- [x] **verify green** — typecheck ×3 · lint clean · **185 tests** (+14: settings store, parser,
  cloner env-safety, endpoints, gating) · build; zero console errors on `/command` · `/ops` ·
  `/repositories/sentinel?settings=1` · `/repositories?add=1` at 1536px. Screenshots sent to Isac.

---

## Auto-Review round (2026-07-16) — structured AI code review, safe by construction
Every new commit on an enabled project gets a real, structured AI code review; nothing is ever
fabricated and nothing is ever auto-applied.
- [x] **Shared contracts** (`@ado/shared/autoreview`, leaf module): `ReviewFinding` (severity ·
  category · file:line · title/detail/suggestion) / `AutoReview` (trigger · ref/refLabel · model
  provenance · status · verdict clean/attention/block · stats) + `autoreview.updated` event with
  upsert-by-id reducer (`state.autoReviews`, newest-first, cap 30) + compaction (latest lifecycle
  row per review id). Reducer tests.
- [x] **Server — safety-first pipeline**: `differ.ts` (READ-ONLY `execFile` git, no shell, cwd only
  from the scanner allow-list; lockfile/dist exclusions; 90K-char cap with an explicit truncation
  marker; dirty tree → uncommitted changes, clean tree → last commit; honest errors for no-commits/
  untracked-only). `ClaudeReviewer` — forced **strict** tool call on the top model, zod-validated,
  **NO heuristic fallback** (a heuristic "review" would fabricate findings — conv. 1): no key →
  typed error → honest failed/skip; **anti-hallucination guard** drops findings whose file isn't in
  the diff. `AutoReviewEngine` — single-flight per repo, enable **seeds the baseline sha** (never
  surprise-reviews old commits), 10-min commit poll via the catch-up scheduler with a per-repo
  min-interval throttle, no-key auto runs skip silently (no failed-row spam), every failure lands as
  an honest `failed` row. 20 server tests (real temp git repos, fake fetch, lifecycle/throttle).
- [x] **Endpoints** (token-gated): `GET /api/autoreview` (settings + honest `hasKey`),
  `POST /api/autoreview/:repoId` (toggle), `POST /api/autoreview/:repoId/run` (manual),
  `POST /api/reviews/:id/fix` (**confirmed** per-finding fix dispatch through the runner allow-list
  — same "nothing acts without confirm" rule as incidents).
- [x] **Web — `/reviews`**: per-project enable/Review-now strip, honest no-key banner ("nothing here
  is simulated"), review cards with verdict/severity/category chips, file:line, fix suggestion, and
  per-finding **Dispatch fix**. Nav in both sidebars (View A badge = reviews needing attention) +
  ⌘K page & per-repo actions. `--demo` seeds one attention + one clean review (self-documenting).
- [x] **Notifications**: non-clean verdicts ping connected Slack/Discord (`reviewNeedsAttention`,
  deduped) — clean reviews stay quiet.
- [x] **verify green** (typecheck ×3 · lint **0 warnings** · **171 tests** · build); zero console
  errors on `/command` · `/ops` · `/reviews` at 1536px. Screenshots sent to Isac.

---

## Self-healing round (2026-07-13) — "if it breaks, fix itself"
Built an honest realization of the ask: the app degrades gracefully instead of breaking, uses the
Anthropic key to explain WHY each failure happened, and offers a **confirmed** one-click fix. Auto-
applying unattended AI code edits to a running app was explicitly rejected as unsafe (the opposite of
"never breaks") — the fix is one-click-with-a-repo-picker through the existing runner + cwd allow-list.
- [x] **Shared contracts** (`@ado/shared/incidents`): `Incident` / `Diagnosis` / `IncidentRecord` zod
  types (self-contained leaf module → no reducer import cycle) + `incident.reported` / `incident.diagnosed`
  events + reducer (`state.incidents`, newest-first, dedupe by id, cap 50, merge diagnosis + flip status).
  3 new reducer tests.
- [x] **Server — `IncidentDiagnoser`** (`incidents/diagnoser.ts`): forced **strict** tool call on
  **`claude-opus-4-8`** (root-cause = the debugging case reserved for the top model, conv. 5), zod-validated,
  with a **heuristic fallback** (pattern table: network/timeout/auth/rate-limit/not-found/null-deref/zod/
  sqlite + kind→severity) that never throws and is honest about low confidence. Thin fetch adapter pinned to
  a fixed anthropic-version (conv. 12); injectable FetchFn seam.
- [x] **Server — `IncidentReporter`** + wiring: publishes `incident.reported` then (fire-and-forget, own
  catch) `incident.diagnosed`; **throttles identical failures to 1/min** so a crash loop can't flood the bus
  or the API. Fastify `setErrorHandler` (reports 500s only, still returns clean JSON) + process
  `unhandledRejection`/`uncaughtException` hooks in index.ts (log + report, **no exit** — degrade, don't die).
  Endpoints: `GET /api/incidents`, `POST /api/incidents` (web ErrorBoundary reports here), `POST
  /api/incidents/:id/fix` (confirmed, repo-scoped dispatch — 404/400/403 honestly). 15 new server tests.
- [x] **Web — resilience + surface**: root `ErrorBoundary` (reports the crash → `/api/incidents`, calm
  fallback, recovers on navigation via a pathname resetKey) wrapping all routes; **`/diagnostics`** page —
  each incident with severity chip, why/fix/prevention, confidence + provenance (AI vs heuristic), and a
  repo-scoped **Dispatch fix**. Nav in both sidebars (live incident-count badge on View A) + ⌘K entry.
- [x] **`--demo` seed**: two example diagnosed incidents (one Claude, one heuristic) so `/diagnostics` is
  self-documenting in the demo world; real mode only ever shows real captured failures.
- [x] **verify green** (typecheck ×3 · lint · **141 tests** · build); zero console errors on
  `/command` · `/ops` · `/diagnostics` at 1536px. Screenshots sent to Isac. PR opened for the ADO repo.

---

## Done (Phase 6 — Prompt Library + optimized loops + hardening)
- [x] **Prompt Library — model-optimized catalog** (`@ado/shared/prompts`): 25 curated, production-grade prompts heavy on **games / mobile / Steam / apps** (+ web/backend/testing/perf/security/refactor/docs/devops), 12 categories. Each prompt has a general `body` + optional per-model `variants`; `renderPrompt(p, model)` prepends a per-model **tuning preamble** (Claude/GPT/Gemini) and picks the best body — so the same prompt comes out **shaped for the selected AI** without duplicating every entry. No-fabrication respected (copy/marketing prompts flagged single-shot drafts, `dispatchable:false`).
- [x] **Trained specialized agents** (`@ado/shared` AGENTS): Game Developer, Mobile Developer, Steam Release Engineer, App Feature Builder — each a dispatch profile with a **system preamble (the training)**, recommended model, and an explicit **verifiable loop + exit check** (convention 6: loops run only on checkable work). `renderAgentDispatch(agent, prompt, model)` wraps a paired prompt with the preamble + loop so the runner **iterates against the exit check** instead of one-shotting.
- [x] **Custom prompts — easy/clean/smooth add** — server `PromptStore` (gitignored `data/prompts.json`, same trust model as connections) with zod-validated CRUD (`CustomPromptInput` shared schema); token-gated `GET/POST/DELETE /api/prompts` (a user's prompts aren't world-readable; built-ins ship in the client bundle). `/prompts` page: trained-agents strip, model selector (Any/Claude/GPT/Gemini → live "optimized for" rendering), category chips w/ counts, search, per-card **Copy / Preview / Run in repo** (dispatches the rendered text to a scanned repo), and inline **New/Edit/Delete** for custom entries. Nav wired in both sidebars (View A "Prompt Library", View B "Prompts").
- [x] **Optimized loops — catch-up scheduler** (`scheduler/`, convention 13): jobs-table-backed, **last-run persisted**, **overdue jobs fire on boot** (a laptop asleep past a nightly job still gets one on wake); injectable clock for tests; a failing job doesn't advance its clock (retries) and never crashes the scheduler; timers unref'd. Token rollup migrated onto it (`runOnBoot`); sub-minute samplers stay on their own intervals by design.
- [x] **P6 — WAL-safe nightly backup** (`backup/`): `VACUUM INTO` (consistent snapshot incl. WAL — a raw copy under WAL corrupts), **reopens the copy and asserts the event row-count matches** the source (fails loudly + deletes a bad copy), then **7-copy rotation**. Registered as a daily scheduled job (true catch-up: only fires if a day elapsed).
- [x] **Verify green** — typecheck ×3 · lint · 67/67 tests (added scheduler ×5, backup ×3, prompt-store ×5, prompt-API ×3) · build. Zero console errors on `/command`, `/ops`, `/prompts` at 1536px.
- [x] **Scale + edge render check** — booted a 53-repo world (`--demo` + 45 synthetic repos across every category/status/CI enum): both views render honest states with **no layout break** (View A grid caps at 6 + "View all"; View B table caps at 5), correct derived counts (Games 12 / Apps 9 / Libraries 8), all four statuses incl. `archived`, zero console errors. Empty + degraded states already covered by `/kit` (p1) and the stale-banner proof (p2).
- [x] **Committed visual smoke** — `scripts/smoke.sh` (`npm run smoke`): boots the deterministic `--demo` world + web, screenshots `/command` · `/ops` · `/prompts`, fails on any console error. A stable render gate for CI (NOT pixel-diff — those wait for the p3.5 polish sign-off so they aren't re-baselined by it).
- [x] **Autostart** — `deploy/pm2.ecosystem.config.cjs` + `deploy/launchd/com.wrexist.acc.server.plist` (templated) + `scripts/install-autostart.sh` (`npm run autostart`): macOS launchd LaunchAgent or Linux pm2, auto-detected; server (the p6 criterion) starts on login. Validated: shell parses, pm2 config loads, plist is well-formed.
- [x] **README quickstart** — refreshed to the real current state (was stale at "Phase 0"); verified every command (`verify`/`dev`/`--demo`/`smoke`/`autostart`), added demo/autostart/smoke sections + accurate architecture tree.
- [ ] **P6 remaining** (gate still `open`): Playwright **pixel-diff** baselines wired into verify (deferred to after p3.5 visual sign-off — the smoke gate covers render+console regressions until then); real one-week daily use (`p2.5`) + real `claude -p` run (`p3`) — both Isac's to close.

## Audit & hardening round (2026-07-12)
Ran a 3-way parallel audit (server / web / shared) and acted on the findings.
- [x] **Correctness/security/resource bugs** — scanner stale-id (rescans silently dropped), GitHub enrich staleness + unbounded log growth, **ACC_TOKEN leaked into the server log** via the SSE `?token=` query (now redacted), runner concurrency-slot leak on throw, queued-run orphan reconcile + drain-past-unrunnable, unbounded `builds` growth (now capped), enrichment-clobber on explicit-undefined, SSE sample bypassing zod + unguarded frame handlers, health-fetch timeout, SSE socket error handler, ciFromRun false-red for cancelled/skipped. All with regression tests.
- [x] **No-fabrication chrome** — removed the hardcoded bell "3" badge, avatar presence dot, and red alert dot (no bus source).
- [x] **Cleanup** — removed dead exports/fields (QUICK_INTENTS, PROMPT_BY_ID, AGENT_BY_ID, Env.githubToken, git dirtyCount, OpsInfo.hasBlockedGate, StatusDot labelTone); consolidated prompt enums (zod-once); deduped cwdFor; extracted useCmdK; fixed doc counts (39 connectors, 25 prompts, real route set).
- [x] **Navigation/wiring** — Command⇄Ops ViewSwitcher in both top bars (/ops was previously unreachable from the UI); AI-assistant suggestion chips now prefill the command box.
- [x] **Stat-card trend deltas (feature)** — new event-sourced `stats.snapshot` (daily rollup via the catch-up scheduler) + reducer history + `statDelta` selector → "↑2 this week" on Repositories/Deployments in both views, and a real active-agent sparkline on View B. Honest: no history → no delta; real mode accrues live, `--demo` seeds a week. **Closes the p3.5 stat-card subline gap.**
- verify green (typecheck ×3, 75 tests, build); zero console errors on /command, /ops, /prompts.

### Deferred-list clearout (2026-07-12, same day)
Did all four items previously deferred.
- [x] **Real ESLint** in the green gate — replaced the placeholder `echo` with ESLint 9 (flat config) + typescript-eslint (unused-vars, explicit-`any` ban). `verify` now genuinely lints.
- [x] **No more dead nav** — built bus-backed pages `/repositories` (category filter + search), `/agents` (running + roster + build queue), `/deployments`, `/activity`, plus a `/planned/:slug` honest placeholder (registry in `lib/planned`). `SectionHeader` gained `actionTo`; every sidebar item, "View all", Quick Action, and the New/Add/Upgrade buttons now route somewhere real or honest.
- [x] **Global command palette (⌘K)** — real search over repos/agents/prompts/pages with keyboard nav; the top-bar search fields open it (were inert). Removed the now-unused useCmdK hook.
- [x] **Type-safety + storage** — shared `Tone` zod enum + `isoTs` timestamp validation on all entities; dropped the unused `snapshots` table (migration 0002); `Bus.compact()` prunes superseded latest-only rows (health/tokens/stats) on boot so the log stays bounded.
- verify green (typecheck ×3, lint, 76 tests, build); zero console errors across all views + the new pages.

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
- [x] **Expanded to 39 connectors across 10 groups** (Isac: "connect to all necessary softwares… AI subscriptions and so on"): Source (GitHub/GitLab/Bitbucket) · **AI (Claude, GPT, Gemini, Mistral, Grok, Groq, OpenRouter, Hugging Face, Ollama)** · Data (Supabase/Firebase/Neon/PlanetScale/MongoDB/Upstash) · Deploy (Vercel/Netlify/Cloudflare/AWS/Fly/Railway/Render) · Mobile (App Store/Google Play/Expo) · Game Dev (Steam/Unity) · Notifications & Project (Slack/Discord/Telegram/Linear/Notion) · Design (Figma) · Monitoring (Sentry/PostHog) · Payments (Stripe). Each: direct "Get key ↗", masked hint, Connect/Update/Disconnect, honest Active vs "Saved · wiring soon". Added a **filter box** + env-fallback auto-detect for common providers

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
- 2026-07-12: **Harness hardened → workflows + CI.** Adopted + improved the LOOPKIT `.claude/` harness (settings/hooks/verifier/9 skills/MCP/MEMORY/run.sh/install.sh), then added `.claude/workflows/` — six opt-in orchestration recipes (understand · ship-feature · review · audit · harden · verify-gate), each with an adversarial-verify pass and lenses mapped to CLAUDE.md conventions — and `.github/workflows/ci.yml` mirroring `npm run verify` on PR + main. Authoring only; no workflow executed yet (no multi-agent opt-in this round).
- 2026-07-12: **Per-repo Automations (new real feature).** `/automations` (replaces the planned stub): bind a prompt/recipe to any repo, run it on command · on a schedule · on a real CI event (build.failed/success). Each run is a real dispatched agent. Server: automations store + engine (event triggers ignore the runner's own builds → no self-retrigger loops; hourly scheduled tick; 2-min debounce) + 5 token-gated endpoints + 12 tests. Shared: Automation/AutomationTrigger + AUTOMATION_TEMPLATES (mobile/game/general one-click recipes). `--demo` seeds 4 examples. Wired into both sidebars + ⌘K. (The referenced X article was unreachable — x.com 403; templates built from established 2026 Claude-Code mobile/game practice, not the tweet.)
- 2026-07-12: **Setup page + Workflows visual (new real features).** `/setup` — typed requirements catalog the local server probes for REAL status (tool `--version`, VS Code ext, env, connection) with one-click allow-listed install (npm globals / VS Code ext) + streamed progress and guided fallbacks; makes the runner's true auth model (the `claude` CLI's own login, not a pasted key) explicit. `/workflows` — server reads the real `.claude/workflows/*.js` meta → visual phase pipelines, replacing the `/planned/workflows` stub. Wired into both sidebars + ⌘K. Server: `setup/probe.ts`, `setup/install.ts`, `workflows/catalog.ts`, 5 endpoints, 17 new tests. Smoke extended to `/workflows` + `/setup` (caught + fixed a Fastify empty-JSON-body 400). verify + smoke green.
- 2026-07-12: **Placeholder/unfinished sweep.** Audited the whole repo (web + a server/shared agent), triaged each placeholder. **Built** 2 real pages from real data: `/performance` (sysmon CPU/mem/net series + health + build throughput) and `/analytics` (repos by type, build outcomes, deploys by env, token trend), wiring their previously-dead nav/links. **Removed** vestigial SaaS (Pro Plan/Upgrade card, Billing/Team/Messages/Calendar) + pruned PLANNED 16→9. **Server honesty fixes:** runner health now emitted (System Health was wrongly capped ≤95% + row blank); `repo.removed` emitted on rescan (completes DELETE /api/projects — no ghost repos); `agent.upserted` added to bus compaction; removed dead ADAPTER_VERSION; honest run-log schema comment. **Copy:** Ops assistant chips carry a real repo (were dead-ending), DeploymentsPage subtitle fixed. verify green (133 tests), smoke green. Remaining placeholders are genuine-future, grouped under "Soon."
- 2026-07-12: **Clarity follow-ups (5).** (1) Both sidebars collapse `/planned/*` items into one dimmed "Soon (N)" `<details>` so the working nav stands out. (2) Settings split into "Active integrations" vs a collapsed "More integrations (N) — save now, activates later"; fixed the misleading Saved chip (→ "Preview"), "Connect"→"Save key" for non-wired, and corrected slack/discord to `wired:true` (the notifier consumes them). (3) Visible System-Health ⓘ (reusable `StatCard.info`, surfaces `HEALTH_FORMULA_DOC`) + dropped the empty sparkline; plain System-Status names (Local Server/Anthropic API/GitHub/Agent Runner). (4) slug→name in AgentsPage rows + PromptsPage repo dropdown. (5) ⌘K gained an Actions tier (Add project · New automation · Connect GitHub · Dispatch to <repo>) that opens the real action surface (keeps the confirm step). verify green (131), smoke green.
- 2026-07-12: **Easier to use/understand pass (survey-driven).** 3 parallel readers audited install/use/understand friction; unanimous #1 = no UI way to add a project (PROJECT_DIRS env-only, read at boot), cascading to dispatch/automations/prompts. Built **runtime project management**: `ProjectDirsStore` + token-gated `GET/POST/DELETE /api/projects`, scanner rebuilt LIVE (`rebuildScanner`, mirrors `startGithub`) over env∪stored dirs, and forgiving (accepts a repo OR a folder-of-repos). Web: `AddProjectPanel` on `/repositories?add=1`; the 4 dead-end "New/Create" buttons + empty states now route here. **GitHub-first `FirstRunCard`** (Connect GitHub = instant restart-free real data). Clarity bundle: de-personalized greetings, "Active Agents"→"AI Agents" (was total-mislabelled-active), "Running Agents" empty state, honest command-box copy + live chips, humanized intent chip, "View Deployments"/"Prompt Library" relabels. Papercuts: `npm run demo`, token-gated the two open setup routes. Verified live (POST temp git repo → repos:1), verify green (131), smoke green. Deferred: nav "Soon" grouping, Settings Active/preview split, System-Health info icon, slug→name in a couple lists, ⌘K actions.
- 2026-07-12: **Zero-config onboarding.** Killed the "offline until you hand-make .env + a token" wall. `scripts/bootstrap-env.mjs` auto-generates a strong `ACC_TOKEN` + matching `VITE_ACC_TOKEN` (idempotent, non-destructive, chmod 600), wired into every start path (root `predev`, server `prestart`, `install.sh`, `install-autostart.sh`, `smoke.sh`, `npm run setup`) — so `npm install && npm run dev` just works and the dashboard comes up **Live**. Added a first-run onboarding card (`MainColumn` `FirstRunCard`, shown only at `repos.length === 0`) guiding the user to `PROJECT_DIRS` + Setup, so first-run online isn't a bare 0/0/0 grid. Convention 9 preserved (server still requires a token; bootstrap always provides one). README quickstart rewritten. Verified live (npm start → /health 200 → Live) + verify green (126) + smoke green + real empty-world screenshot.
- 2026-07-12: **PR #1 merged; fixed 3 real-run bugs from its Codex review.** All P2, all verified real, all in real-`claude`-run paths the demo masks: (1) **runner stderr deadlock** — `claude -p` spawned with a piped-but-unread stderr blocks the child once it exceeds the OS pipe buffer → run hangs to the 15-min timeout; fixed with `stdio[2]='ignore'` (can't merge into the JSONL stdout). (2) **repo agent tag unresolvable** — `repo.agents` stored the display string `Agent · <repo>` but `state.agents` is keyed by `runId`, so real-run per-project Agents/avatars were empty; now stores the `runId` (deduped, newest-first, capped 5) +1 regression test. (3) **Node floor** — code uses `process.loadEnvFile` (Node 20.12+) while engines/CI/docs said ≥20; raised the declared floor to `>=20.12` (engines · CI `node-version: 20.12` · README · CLAUDE.md · requirements) + a guard that fails with a clear message. Restarted the branch from `origin/main` (merged PR is finished — fresh change, no new PR). verify green (126 tests).
- 2026-07-12: **Three real features (deploy status · notifications · LLM parser).** (1) **Per-repo deploy status** — `latestDeployment` selector → repo cards show the most recent real deploy (env, tinted by ok, timestamp); cards are now the click target → the project page; absent deploy = no chip (honest). (2) **Outbound notifications** — `Notifier` pings connected Slack/Discord webhooks on real CI failures + deployments (per-platform body shape, 60s dedup, 5s timeout, logged-not-thrown); connecting a webhook is the opt-in; URL is a server-side secret, text composed from typed fields not echoed input. (3) **LLM-backed command parser** — `ClaudeParser` classifies the command box via the Messages API with a forced tool call (structured `Intent`, zod-validated) when an Anthropic key is connected, and **falls back to the heuristic parser** on no-key/error/invalid (honest `parsedBy`); thin fetch adapter pinned to a fixed anthropic-version (convention 12), command text handled as data not instructions (convention 11), model `claude-haiku-4-5` for a cheap 5-way classification (convention 5), configurable. Server: `notify/notifier.ts`, `command/claudeParser.ts`, consolidated bus subscription. +12 tests (notifier 4, spawnMerged 2 earlier, parser 6). verify green (125 tests).

## Blocked
- (none) — Phase 0 scaffold verified green. `npm audit` reports dev-dependency advisories (vite/esbuild chain); triaged in Phase 6 hardening, not blocking.

## Notes
- Terminal-started Claude sessions are **not** live-tracked in v1 (honest limitation; token parsing only).
- Billing / Team / Messages / Upgrade were REMOVED (vestigial SaaS for a local single-user tool); Performance + Analytics graduated to real pages. Remaining `/planned/*` items (Templates, Code Assistant, Game Builder, UI Generator, Database, CI/CD, Models, Alerts, New-agent) render as honest "not wired yet" pages, grouped under the "Soon" nav disclosure — no fake features.
