# PROMPTS.md — Claude Code build sequence (copy-paste, in order)

Setup first: create the repo, drop this package's files in (CLAUDE.md at root, ops.yml → .claude/ops.yml, docs at root, reference PNGs → design/reference/). Every prompt ends the same way — run /verify, commit, update TASK.md — so it's stated once here and omitted below. Run /gate at each phase boundary; don't start the next phase on an open gate.

## Phase 0 — Foundation

**0.1** Scaffold an npm-workspaces monorepo per CLAUDE.md: apps/web (Vite React 18 TS Tailwind Zustand, routes /command and /ops), apps/server (Fastify TS, drizzle+SQLite, GET /health, SSE stub at /events), packages/shared (zod event contracts skeleton + tokens.ts with every value from DESIGN_SPEC §tokens wired into the Tailwind theme). Add scripts/verify.sh (typecheck, lint, test, build) and prove it runs green. Run /project-init to finalize the ops manifest against reality.

**0.2 — plan council (do not skip).** Read MASTER_PLAN.md, DESIGN_SPEC.md, DATA_MAP.md, SELF_LEARNING.md. Adversarially attack this plan from three angles as three subagents: (a) senior frontend eng — where does the 1:1 recreation or live-update model break; (b) infra eng — where do the scanner/runner/SQLite/SSE choices fail at 20 repos and 10 concurrent agents; (c) skeptical solo-dev advisor — which features won't earn their maintenance cost. Merge into a findings table (blocking / should-fix / note), propose plan amendments for blockers, and wait for my approval before Phase 1.

**0.3** Build packages/shared mock-data module: typed fixtures for every widget in DESIGN_SPEC (repos, agents, builds, activity, deployments, system metrics) using MY real project names (SENTINEL, Dynasty Manager, tower-defense, Atlas, Singularity Inc, Bloom). Mock values must be plausibly shaped and clearly marked as fixtures.

## Phase 1 — Pixel shell (reference images are the spec)

**1.1** Build the app chrome for View A per DESIGN_SPEC: top bar, sidebar with all groups/items/badges, 3-column layout shell. Compare against design/reference/view-a.png before finishing — spacing, sizes, colors must match.

**1.2** Build View A main column on mock data: header row, 4 stat cards, repository filter tabs + 3×2 card grid with all card internals (status, meta, gradient progress, agent-avatar stack), view-all bar, Running Agents strip.

**1.3** Build View A right rail: AI Command Center card, Recent Activity, System Status, help card. Then a dedicated polish pass with view-a.png side by side; fix every visible deviation; screenshot and list any that remain with reasons.

**1.4** Build View B per DESIGN_SPEC on mock data: its top bar + sidebar variant (incl. Monitoring group, Pro Plan card), 5 stat cards (radial, sparklines), Projects Overview table, Build Queue, Activity Feed, AI Agents roster, AI Assistant panel, System Monitor charts, Quick Actions, Recent Deployments. Same side-by-side polish pass against view-b.png.

**1.5** Quality floor pass: ⌘K focuses search, visible keyboard focus everywhere, reduced-motion honored, zero console errors, no layout shift when mock values change. Then request my visual sign-off → /gate p1-pixel-shell.

## Phase 2 — Data core

**2.1** Implement the typed event bus end to end: zod contracts in packages/shared for every event in DATA_MAP, SQLite persistence (events + daily snapshots + samples tables), SSE stream, and a web-side bus client feeding Zustand slices. UI renders exclusively from slices — delete direct mock imports from components (mocks remain only as a --demo seed flag).

**2.2** Build the scanner: walk the projects dir from .env (PROJECTS_DIR), read git status/branch/last-commit, parse .claude/ops.yml (category, gates, status) and TASK.md (open item count), fs-watch for changes, emit typed events. Sidebar counts and repo cards go live.

**2.3** GitHub integration (octokit, token from .env): repos, stars, PRs, language, latest Actions run per repo → progress bars per DATA_MAP mapping; releases → deployments. Poll cadence per DATA_MAP. Handle rate limits with backoff and a Degraded health state.

**2.4** System layer: systeminformation sampling (10s), health checks (60s: GitHub, Anthropic, server, runner), System Monitor charts and System Status from real samples only. Implement stale/offline UI states (server killed → banner + greyed timestamps). Run the full data-integrity audit → /gate p2-data-core.

## Phase 3 — Agents & builds

**3.1** Build the runner: dispatch endpoint spawning `claude -p` headless with --output-format stream-json, explicit turn cap, cwd allow-list from scanner; parse the stream into typed agent events (started, tool-use, progress, done, failed); registry table survives restarts (orphan processes reconciled on boot).

**3.2** Wire Running Agents strip + AI Agents roster + Build Queue + Activity Feed to runner + Actions events. Agent avatars replace mock teammate stacks everywhere. Add the run logger schema from SELF_LEARNING §1 (every run: repo, task, model, tokens, duration, verify verdict, human action).

**3.3** End-to-end proof: dispatch one real TASK.md item from a real repo via the dashboard, watch live progress, see verify verdict and activity entries land. → /gate p3-agents.

## Phase 4 — Command center

**4.1** Implement intent parsing for the command input (Claude API, structured output): the 5 v1 intents from DATA_MAP with confirmation UI before any dispatching intent executes. Wire quick-action chips and Quick Actions grid to the same server actions.

**4.2** Token accounting: parse Claude Code session logs/telemetry into hourly rollups; AI Tokens Used card + per-run tokens in the run log, all values shown with ≈. ⌘K search over repos/agents/tasks. → /gate p4-command.

## Phase 5 — Self-learning

**5.1** Nightly analyzer per SELF_LEARNING §2–3: Haiku aggregation pass + Sonnet proposal pass, output = proposal rows (diff, evidence links, expected effect, class). Read-only log access; no repo writes.

**5.2** Proposal inbox UI (notification badge): diff view, evidence, apply/reject/snooze; apply = single revertable commit to the target repo via the runner; rejections logged and fed back into the next analysis.

**5.3** Metrics: deterministic script computing 7-day trailing success rate and median tokens per completed task from the run log; chart both on View B; System Health formula implemented and documented in its tooltip. Schedule: nightly analyzer, Friday self-report, monthly reasoning-skill regeneration per SELF_LEARNING §5. → /gate p5-self-learning (needs one real accepted proposal — this gate closes days later, that's expected).

## Phase 6 — Hardening

**6.1** Error/empty/loading states for every widget (empty DB, no network, no token, 50+ repos perf pass with virtualized lists where needed), .env.example + README quickstart, /code-review high on the full diff, fix findings. → /gate p6-hardening.

## V2 amendments to the sequence (from AUDIT.md)

**1.0 (new, before 1.1)** Build the shared component kit in apps/web/src/kit from DESIGN_SPEC §V2: Card, StatCard, GradientProgress, StatusDot, Chip, FeedRow, AgentTile, SectionHeader, IconTile, AvatarStack, plus custom SVG Sparkline, RadialRing, MiniArea. Self-host Inter via @fontsource. Storybook-style demo route /kit rendering every component in every state. Rule from here on: views compose only kit components; promote one-offs into the kit before use.

**2.1 addition** — implement X-ACC-Token validation on all mutating endpoints (secret from .env), strict CORS to the web origin, SSE read-only. Enable SQLite WAL and drizzle migrations from the first table.

**2.3 addition** — use octokit conditional requests (ETags) so unchanged polls cost no rate limit; scanner reads PROJECT_DIRS as a list.

**3.1 addition** — wrap stream-json parsing in a versioned adapter; on unknown format, agents render "running (opaque)" and the run still logs start/end/exit. Spawned processes get a minimal env allow-list. Prove the fallback with a test feeding it a mutated format.

**4.2 addition** — session-log token parsing goes through the same adapter pattern; unknown format → "tokens unavailable", never a guessed number.

**4.3 (new)** — macOS notifications via node-notifier: failed build, gate → blocked, new proposal. Respect a mute toggle in the UI. Also implement the catch-up scheduler (jobs table with last_run; overdue >20h fires on boot) — the analyzer will depend on it.

**6.1 additions** — capture Playwright screenshot baselines of both views (from the Phase-1 approved state) and wire visual diff into scripts/verify.sh; launchd (or pm2) autostart config + README section; nightly db backup with 7-copy rotation.

## V3 amendments to the sequence (Prompt 0.2 council — see docs/COUNCIL.md)

The council + Isac's decisions reorder the sequence **value-first** and adjust several prompts. Where a V2 and V3 note conflict, **V3 wins**.

- **0.3 (revised)** — the mock-data module is **per-view**: view-a and view-b carry different illustrative numbers (they disagree in the references; council B1). Mark clearly as fixtures.
- **Phase 1 is now the *functional shell*, not the pixel shell (D1).** Prompts 1.0–1.4 still build the kit-first and both views on mock, but the gate is `p1-functional-shell`: structurally complete, all components present and wired, every state (failure/idle/empty/degraded) rendered in `/kit` (council S1). **Drop the "pixel-match the PNG" acceptance from 1.x** — it moves to the new pixel-polish prompt. Bake in reserved-width masks + fixed-footprint degraded states now (council B3, S2).
- **New prompt 3.5 (pixel polish)** — after Phase 3, with real data + a frozen `--demo` seed, pixel-match both views to the references on layout/spacing/color/component-presence (not digits); capture Playwright baselines against the `--demo` seed with dynamic regions masked (council B1/B2). This carries Isac's 1:1 sign-off.
- **2.1 addition** — SSE emits monotonic event IDs, a full snapshot on connect, and `Last-Event-ID` replay (council S5). Add a **Host-header allow-list on all routes incl. `/events`** and carry the SSE token via same-origin cookie/query (council S0).
- **2.4 addition** — System Health % is a documented deterministic formula (no analyzer dependency); log app-open events for the P2.5 gate.
- **2.2 addition** — scanner watches only `ops.yml`/`TASK.md` with an ignore-list, debounced, FD-safe, symlink-skipping, depth-capped (council S4).
- **3.1 addition (revised)** — the runner adds a **dispatch semaphore** (default 3–4, backs the Build Queue) + per-run wall-clock timeout + token budget + reduced priority (council B4), on top of the existing versioned adapter + env allow-list.
- **New P2.5 gate** — before Phase 3, run `/gate p2.5-daily-driver`: opened ≥5 of the trailing 7 days, else STOP and reassess (council B6).
- **Phase 5 prompts (5.1–5.3) are parked (D2).** The run logger from 3.2 ships; the analyzer/inbox/metrics are built post-v1 at ≥100 runs. If built, bar executable-content auto-apply and route via PR + second-model screen (council S6).
- **6.1 (revised)** — nightly backup uses `VACUUM INTO` + a row-count assert before rotation, not a raw file copy (council B5). Visual baselines come from the P3.5 approved state.
