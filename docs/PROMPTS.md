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
