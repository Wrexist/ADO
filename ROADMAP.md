# ROADMAP — Phased Plan

> The phase-by-phase plan to reach the [goals](./GOALS.md). Each phase has a **go/no-go gate** — the exact, machine-checkable version lives in [`.claude/ops.yml`](./.claude/ops.yml) and is run with `/gate`. **Phases are sequential; no Phase N+1 work while N's gate is open.**

Legend: 🔴 not started · 🟡 in progress · 🟢 gate passed

---

## v1 — AI Control Center (the wedge)

Full spec: [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) · designs: [`docs/DESIGN_SPEC.md`](./docs/DESIGN_SPEC.md) · data sources: [`docs/DATA_MAP.md`](./docs/DATA_MAP.md) · build prompts: [`docs/PROMPTS.md`](./docs/PROMPTS.md)

| Phase | Name | Scope | Est. | Status |
|:-----:|------|-------|:----:|:------:|
| **0** | Foundation | Monorepo, tokens, mock data, ops manifest, plan council | 0.5–1d | 🟡 |
| **1** | Pixel shell | Shared kit + both views, static on mock data, 1:1 to references | 2–3d | 🔴 |
| **2** | Data core | Server, SQLite, event bus, scanner, GitHub sync, SSE — real data | 3d | 🔴 |
| **3** | Agents & builds | Headless runner, agent registry, live progress, build queue | 3–4d | 🔴 |
| **4** | Command center | NL command box → intent → actions; token tracking | 2–3d | 🔴 |
| **5** | Self-learning | Run logger, nightly analyzer, proposal inbox, metric charts | 3–4d | 🔴 |
| **6** | Hardening | Error/empty/loading states, perf, visual-diff, autostart, docs | 2d | 🔴 |

**Total: ~3 weeks part-time.** Descope lever (named, not hidden): if Phase 1 exceeds 3 days, View B ships *after* Phase 2 instead of blocking it.

---

### Phase 0 — Foundation 🟡

*Get a green, buildable monorepo and a reviewed plan before any feature code.*

**Deliverables**
- npm-workspaces monorepo: `apps/web` (Vite + React 18 + TS + Tailwind + Zustand), `apps/server` (Fastify + TS, drizzle/SQLite, `/health`, SSE stub at `/events`), `packages/shared` (zod contracts skeleton + `tokens.ts`)
- `tokens.ts` carrying every value from [`DESIGN_SPEC §tokens`](./docs/DESIGN_SPEC.md), wired into the Tailwind theme
- `scripts/verify.sh` (typecheck · lint · test · build) proven green
- Typed **mock-data module** in `packages/shared` for every widget, using real project names (SENTINEL, Dynasty Manager, tower-defense, Atlas, Singularity Inc, Bloom)
- **Plan council** (Prompt 0.2): three adversarial subagents (frontend / infra / skeptical solo-dev) attack the plan; findings merged and blockers addressed

**Gate `p0-foundation`** — monorepo builds & `verify.sh` green · `tokens.ts` matches spec, mock data typed · plan-council review completed and blocking findings addressed

> Prompts: **0.1** scaffold · **0.2** council · **0.3** mock data. See [`docs/PROMPTS.md`](./docs/PROMPTS.md).

---

### Phase 1 — Pixel shell 🔴

*Both views, fully static on mock data, matching the reference images 1:1.*

**Deliverables**
- **Shared component kit first** (`apps/web/src/kit`): Card, StatCard, GradientProgress, StatusDot, Chip, FeedRow, AgentTile, SectionHeader, IconTile, AvatarStack + custom SVG Sparkline, RadialRing, MiniArea. Inter self-hosted via `@fontsource`. A `/kit` demo route renders every component in every state. **Views compose kit components only.**
- **View A — Command Center** (`/command`): top bar, sidebar, 4 stat cards, repository filter tabs + 3×2 card grid, Running Agents strip, right rail (AI Command Center, Recent Activity, System Status, help)
- **View B — Ops Dashboard** (`/ops`): sidebar variant + Pro Plan card, 5 stat cards (radial, sparklines), Projects Overview table, Build Queue, Activity Feed, AI Agents roster, AI Assistant, System Monitor, Quick Actions, Recent Deployments
- Quality floor: ⌘K focuses search, visible keyboard focus, reduced-motion honored, 0 console errors, no layout shift on value change

**Gate `p1-pixel-shell`** — kit built first & views compose only from it · both views match references side-by-side at 1536px · 0 console errors, focus visible, reduced-motion respected · **Isac has compared both views against the images and logged approval in `TASK.md`**

> Canonical viewport **1536px** (graceful to 1280, horizontal scroll below). No mobile in v1.

---

### Phase 2 — Data core 🔴

*Replace mock values (never the layout) with your real portfolio.*

**Deliverables**
- Typed **event bus** end-to-end: zod contracts for every event in [`DATA_MAP`](./docs/DATA_MAP.md), SQLite persistence (events + daily snapshots + samples), SSE stream, web-side bus client feeding Zustand slices. UI renders exclusively from slices.
- **Scanner**: walks `PROJECT_DIRS`, reads git status/branch/last-commit, parses `.claude/ops.yml` + `TASK.md`, fs-watches for changes, emits typed events
- **GitHub sync** (octokit, ETag conditional requests): repos, stars, PRs, language, latest Actions run → progress bars; releases → deployments
- **System layer**: `systeminformation` samples (10s), health checks (60s), stale/offline UI states (kill server → honest banner)
- **Security & resilience**: `X-ACC-Token` on mutating endpoints, strict CORS, SSE read-only; SQLite WAL + drizzle migrations + nightly backup (keep 7)

**Gate `p2-data-core`** — scanner + GitHub + sysmon + health live, both views on real data · data-integrity audit clean · killing the server → honest offline/stale state · mutating endpoints reject missing `X-ACC-Token`, CORS locked · WAL + migrations + conditional requests

> 🎯 **Daily-Driver Milestone** lands here: this must replace your manual repo/CI checking.

---

### Phase 3 — Agents & builds 🔴

*Mission control that can act, and a run log that becomes the learning asset.*

**Deliverables**
- **Runner**: dispatch endpoint spawning `claude -p --output-format stream-json`, explicit turn cap, cwd allow-list, minimal env allow-list; **versioned adapter** parses the stream (unknown format → "running (opaque)", still logs start/end/exit); registry survives restart (orphans reconciled on boot)
- Wire Running Agents strip + AI Agents roster + Build Queue + Activity Feed to real runner/Actions events; agent avatars replace mock stacks
- **Run logger** ([`SELF_LEARNING §1`](./docs/SELF_LEARNING.md)): every run records repo, task, model, tokens, duration, verify verdict, human action

**Gate `p3-agents`** — a real dispatched task runs headless to completion with live progress · build queue + activity feed reflect real events, registry survives restart · simulated stream-format change degrades gracefully without crashing · spawned agents get minimal env

> ⚠️ **Kill criterion checkpoint:** if the dashboard isn't opened daily for 7 days after this phase, stop before Phase 5 and reassess.

---

### Phase 4 — Command center 🔴

*Describe intent; the dashboard acts.*

**Deliverables**
- **Intent parsing** (Claude API, structured output) for 5 v1 intents with a confirmation step before any dispatching intent runs: `status_query`, `dispatch_task`, `create_task` (writes `TASK.md`), `run_gate`, `summarize_activity`. Quick-action chips wired to the same server actions.
- **Token accounting**: parse Claude Code session logs (same versioned-adapter pattern; unknown → "tokens unavailable") into hourly rollups; AI Tokens Used card + per-run tokens, all shown with `≈`
- ⌘K search over repos / agents / tasks
- **macOS notifications** (node-notifier): failed build, gate → blocked, new proposal (mute toggle) + **catch-up scheduler** (jobs table, overdue >20h fires on boot)

**Gate `p4-command`** — 5 intents end-to-end · token usage per run recorded and shown with `≈`

---

### Phase 5 — Self-learning 🔴

*The headline feature: the system mines its own history and proposes concrete improvements — proven by two moving metrics.* ([`SELF_LEARNING.md`](./docs/SELF_LEARNING.md))

**Precondition:** ≥25 runs logged (volume floor — below this the analyzer produces confident noise).

**Deliverables**
- **Nightly analyzer**: Haiku aggregation pass + Sonnet proposal pass → proposal rows (diff, evidence links, expected effect, class). Read-only log access; no repo writes.
- **Proposal inbox** (notification badge): diff view, evidence, apply/reject/snooze; apply = one revertable commit via the runner; rejections logged and fed back
- **Metrics**: deterministic script computes 7-day trailing success rate + median tokens per completed task; both charted on View B; System Health formula documented in its tooltip
- Schedules: nightly analyzer, Friday self-report, monthly reasoning-skill regeneration

**Gate `p5-self-learning`** — ≥25 runs precondition met · catch-up scheduler proven (overdue job fires on boot) · ≥1 real proposal accepted · success-rate + tokens/task charts render from deterministic output · rejected proposals influence next analysis

> This gate closes *days later* by design — it needs a real accepted proposal.

---

### Phase 6 — Hardening 🔴

*Survive the real world.*

**Deliverables**
- Error/empty/loading states for every widget (empty DB, no network, no token, 50+ repos with virtualized lists where needed)
- **Playwright visual baselines** captured at Phase-1 sign-off, wired into `verify.sh` so later phases can't silently break the 1:1 match
- **Autostart** (launchd/pm2) so the server survives reboots + **nightly db backup** with 7-copy rotation
- `.env.example` + README quickstart takes a fresh clone → running dashboard; `/code-review high` on the full diff, fix findings

**Gate `p6-hardening`** — `/verify` green end-to-end · empty-DB / no-network / 50-repo all render honest states · visual baselines wired and passing · autostart + backup exist · README quickstart works from a fresh clone

---

## How v1 rolls up into the platform vision

The v1 phases are not throwaway — each is the seed of a platform capability in [`docs/VISION_ADO.md`](./docs/VISION_ADO.md). We extend these cores; we never rewrite them.

| v1 delivers | Platform phase it seeds |
|-------------|-------------------------|
| Typed event bus + SQLite history (P2) | **Platform Phase 0** — Event Bus, Gateway, Worker Framework |
| Scanner + GitHub sync + repo cards (P2) | **Platform Phase 1** — Workspace/Project/Repository system, indexing |
| Headless runner + registry + adapters (P3) | **Platform Phase 2** — AI Runtime (provider abstraction, streaming, cost) |
| Run log + repo parsing (P3) | **Platform Phase 3** — Repository Intelligence (graphs, health, risk) |
| Agent roster + intent routing (P3–4) | **Platform Phase 4** — AI Organization (Planner→…→Learning) |
| (future) knowledge graph over the run log | **Platform Phase 5** — Knowledge Engine (semantic search, memory) |
| Catch-up scheduler + automation hooks (P4–5) | **Platform Phase 6** — Automation Engine |
| Deterministic metrics + trend charts (P5) | **Platform Phase 7** — Predictive Intelligence |
| Nightly analyzer + proposal loop (P5) | **Platform Phase 8** — Learning Platform (self-improvement) |
| localhost + `.env` today | **Platform Phase 9** — Enterprise (orgs, SSO, distributed workers, cloud) |

**Long-term versions:** v1.0 stable platform → v2.0 autonomous AI team → v3.0 self-learning platform → v4.0 AI CTO / PM / Release Manager with autonomous planning, review, and release.

---

## Working agreement

- **Gate-driven:** run `/gate <name>` at each boundary; `.claude/ops.yml` refuses to skip.
- **Commit per turn**, update [`TASK.md`](./TASK.md) each session, one learning per line in `LEARNINGS.md` (the nightly analyzer consumes it).
- **Model routing:** use the lowest-capable model that does a coding subtask reliably; reserve the top model for architecture, gate evaluation, and debugging that resisted one attempt.
- **No loops on copy:** UI text, marketing, and naming are single-shot drafts for Isac to edit; loops run only on verifiable work.
- **Track the competition on-screen:** the Friday sweeper watches this repo like the others; a blocked gate > 1 week halts new phase work.
