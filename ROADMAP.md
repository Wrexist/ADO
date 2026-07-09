# ROADMAP — Phased Plan

> The phase-by-phase plan to reach the [goals](./GOALS.md). Each phase has a **go/no-go gate** — the exact, machine-checkable version lives in [`.claude/ops.yml`](./.claude/ops.yml) and is run with `/gate`. **Phases are sequential; no Phase N+1 work while N's gate is open.**
>
> **V3 (2026-07-09):** restructured **value-first** after the Prompt 0.2 plan council ([`docs/COUNCIL.md`](./docs/COUNCIL.md)) and Isac's decisions D1–D3. Pixel-match moved *after* the data core (P3.5); a machine-enforced Daily-Driver gate (P2.5) now precedes the expensive phases; self-learning (P5) is parked post-v1; View B is built full 1:1.

Legend: 🔴 not started · 🟡 in progress · 🟢 gate passed · ⏸️ parked

---

## v1 — AI Control Center (the wedge)

Full spec: [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) · designs: [`docs/DESIGN_SPEC.md`](./docs/DESIGN_SPEC.md) · data sources: [`docs/DATA_MAP.md`](./docs/DATA_MAP.md) · build prompts: [`docs/PROMPTS.md`](./docs/PROMPTS.md) · council: [`docs/COUNCIL.md`](./docs/COUNCIL.md)

| Phase | Name | Scope | Est. | Status |
|:-----:|------|-------|:----:|:------:|
| **0** | Foundation | Monorepo, tokens, per-view mock data, ops manifest, plan council | 0.5–1d | 🟢 |
| **1** | Functional shell | Shared kit + both views, structurally complete on mock — **not yet pixel-judged** | 2–3d | 🟡 |
| **2** | Data core | Server, SQLite, event bus, scanner, GitHub sync, SSE — real data | 3d | 🔴 |
| **2.5** | Daily-driver gate | Enforced usefulness check: opened ≥5 of trailing 7 days **before** Phase 3 | — | 🔴 |
| **3** | Agents & builds | Headless runner (semaphore + timeout), registry, live progress, **run logger** | 3–4d | 🔴 |
| **3.5** | Pixel polish | The **1:1 match** — judged on real data + a frozen `--demo` seed; visual baselines | 2–3d | 🔴 |
| **4** | Command center | Dispatch/status buttons + NL intents; token tracking | 2–3d | 🔴 |
| **6** | Hardening | Honest states at scale, visual-diff, WAL-safe backup, autostart, docs | 2d | 🔴 |
| **5** | Self-learning | **Parked post-v1** — the P3 run logger preserves the asset; analyzer built at ≥100 runs | — | ⏸️ |

**Honest estimate: ~16–20 working days.** First real value — the **Daily-Driver Milestone** (P2.5) — lands around **week 2**, *before* the pixel polish and agent phases. That reordering is the whole point of value-first. View B is built full 1:1 (D3); the old "View B descope" lever is retained only as an emergency fallback.

---

### Phase 0 — Foundation 🟢 (passed 2026-07-09)

*Get a green, buildable monorepo and a reviewed plan before any feature code.*

**Deliverables**
- npm-workspaces monorepo: `apps/web` (Vite + React 18 + TS + Tailwind + Zustand), `apps/server` (Fastify + TS, drizzle/SQLite, `/health`, SSE stub), `packages/shared` (zod contracts + `tokens.ts`) — **✅ scaffolded, verify green**
- `tokens.ts` carrying every value from [`DESIGN_SPEC §tokens`](./docs/DESIGN_SPEC.md), wired into the Tailwind theme — **✅**
- `scripts/verify.sh` proven green — **✅**
- **Plan council** (Prompt 0.2): three adversarial reviewers → [`docs/COUNCIL.md`](./docs/COUNCIL.md); blockers addressed via decisions D1–D3 — **✅**
- Typed **per-view mock-data module** (Prompt 0.3): fixtures for every widget using real project names, with **per-view overrides** (view-a and view-b carry different illustrative numbers; see council B1) — **✅ `packages/shared/src/mock`, 7 consistency tests**

**Gate `p0-foundation`** — monorepo builds & `verify.sh` green · `tokens.ts` matches spec, per-view mock data typed · plan-council completed, blocking findings addressed

---

### Phase 1 — Functional shell 🔴

*Both views, structurally complete on mock data — every component present and wired, but **not yet judged on pixels**. Value-first: get the skeleton usable, polish later (D1).*

**Deliverables**
- **Shared component kit first** (`apps/web/src/kit`): Card, StatCard, GradientProgress, StatusDot, Chip, FeedRow, AgentTile, SectionHeader, IconTile, AvatarStack + custom SVG Sparkline, RadialRing, MiniArea. Inter self-hosted. A `/kit` demo route renders every component in **every state — including failure / idle / empty / degraded** (council S1), signed off as canonical for the states the references omit. Views compose kit components only.
- **View A — Command Center** (`/command`) and **View B — Ops Dashboard** (`/ops`), full component inventory per [`DESIGN_SPEC`](./docs/DESIGN_SPEC.md), on **per-view mock** data, structurally matching the references (all widgets present, correct layout regions) — pixel-perfection deferred to P3.5.
- **Layout-stability rules baked in now:** live/elapsed values render in reserved fixed-width masked slots; degraded states are fixed-footprint tokens, not reflowing prose (council B3, S2).
- Quality floor: ⌘K focuses search, visible keyboard focus, reduced-motion honored, 0 console errors, no layout shift when mock values change.

**Gate `p1-functional-shell`** — kit built first (incl. custom SVG) & views compose only from it · both views structurally complete on per-view mock at 1536px · failure/idle/empty/degraded states designed in `/kit` · live values in reserved-width slots, no layout shift · 0 console errors, focus visible, reduced-motion respected

---

### Phase 2 — Data core 🔴

*Replace mock values (never the layout) with your real portfolio. This is where it starts being useful.*

**Deliverables**
- Typed **event bus** end-to-end: zod contracts for every event in [`DATA_MAP`](./docs/DATA_MAP.md), SQLite persistence (events + daily snapshots + samples), SSE, web-side bus client feeding Zustand slices. UI renders exclusively from slices.
- **SSE resilience** (council S5): monotonic event IDs, a **full snapshot on every (re)connect** before live deltas, `Last-Event-ID` replay from the events table, and a "reconnecting/stale" indicator — so a laptop sleep never renders stale state as live.
- **Scanner**: walks `PROJECT_DIRS`, git status/branch/last-commit, parses `.claude/ops.yml` + `TASK.md`, fs-watches for changes, emits typed events.
- **GitHub sync** (octokit, ETag conditional requests): repos, stars, PRs, language, latest Actions run → progress bars; releases → deployments.
- **System layer**: `systeminformation` samples (10s), health checks (60s), stale/offline UI states. **System Health %** uses a **documented deterministic formula** (health-checks + failed-builds + runner-errors) — no dependency on the parked analyzer (council D3/S3).
- **Security & resilience** (council S0 — treated as hard criteria): **Host-header allow-list on all routes incl. `/events`** (the real DNS-rebinding defense), `X-ACC-Token` on mutating endpoints, strict CORS, SSE token via same-origin cookie/query; SQLite WAL + drizzle migrations.
- **App-open logging** so the P2.5 gate can be measured.

**Gate `p2-data-core`** — real data both views · integrity audit clean, System Health formula documented · kill server → honest offline/stale, SSE snapshot + replay · Host-header allow-list on all routes, X-ACC-Token, CORS locked · WAL + migrations + ETags · app-opens logged

> 🎯 **Daily-Driver Milestone** lands here: this must replace your manual repo/CI checking.

---

### Phase 2.5 — Daily-driver gate 🔴 *(new — the enforced off-ramp, council B6)*

*The anti-pivot clause, moved out of prose and into the manifest — **before** the two most expensive phases.*

**Gate `p2.5-daily-driver`** — dashboard opened on **≥5 of the trailing 7 distinct days** (from logged app-open events) · it has replaced manual repo/CI checking.

**On fail:** STOP before Phase 3 and reassess. This is the project's real kill switch — the same `/gate` mechanism that governs everything else, evaluated on data, not on the author's memory a week later.

---

### Phase 3 — Agents & builds 🔴

*Mission control that can act, and a run log that becomes the durable learning asset.*

**Deliverables**
- **Runner**: dispatch endpoint spawning `claude -p --output-format stream-json` with a **dispatch semaphore** (default max 3–4, backs the Build Queue — excess dispatches show "queued", not spawned), **per-run wall-clock timeout + token budget**, reduced OS priority, turn cap, cwd + minimal-env allow-lists (council B4). **Versioned adapter** parses the stream (unknown → "running (opaque)", still logs start/end/exit); registry survives restart (orphans reconciled on boot).
- **Scanner hardening** (council S4): watch only `ops.yml`/`TASK.md` with an ignore-list (`node_modules`/`.git`/`dist`), debounce rescans 2–5 s, suppress rescans for a cwd a runner owns, cap walk depth, skip symlinks.
- Wire Running Agents strip + AI Agents roster + Build Queue + Activity Feed to real events; agent avatars replace mock stacks.
- **Run logger** ([`SELF_LEARNING §1`](./docs/SELF_LEARNING.md)): every run records repo, task, model, tokens, duration, verify verdict, human action — **the asset the parked analyzer will mine later**.

**Gate `p3-agents`** — a real dispatched task runs to completion with live progress · runner enforces semaphore + timeout + budget · registry survives restart · stream adapter degrades to "running (opaque)" · scanner scoped/debounced/FD-safe · run logger persists every run

---

### Phase 3.5 — Pixel polish 🔴 *(new — the 1:1 match, now judged on real data, council D1/B1/B2)*

*The pixel-perfect pass, run **after** the dashboard is real and proven useful — so polish lands on something you actually open.*

**Deliverables**
- With **real data + a frozen deterministic `--demo` seed** (fixed clock, fixed sample arrays, fixed numbers), pixel-match both views to the references on **layout, spacing, color, and component presence — not digits** (reference numbers are illustrative and per-view).
- Capture **Playwright visual baselines against the `--demo` seed**, with known-dynamic regions masked (council B2) — a baseline that can actually stay green.

**Gate `p3.5-pixel-polish`** — both views match `design/reference/*.png` on layout/spacing/color/component-presence at 1536px · baselines captured against the `--demo` seed with dynamic regions masked · **Isac has compared both views against the images and logged approval in `TASK.md`**

---

### Phase 4 — Command center 🔴

*Describe intent; the dashboard acts.*

**Deliverables**
- **Dispatch + status as quick-action buttons** from the start (the run logger sits behind them regardless — this guarantees the log fills even if NL is little-used; council N1).
- **Intent parsing** (Claude API, structured output) for 5 v1 intents with a confirmation step: `status_query`, `dispatch_task`, `create_task` (writes `TASK.md`), `run_gate`, `summarize_activity`.
- **Token accounting**: parse Claude Code session logs (versioned adapter; unknown format → fixed-footprint "tokens unavailable", never a guess; council S2) into hourly rollups; AI Tokens Used card + per-run tokens, shown with `≈`.
- ⌘K search over repos / agents / tasks; macOS notifications (failed build, gate → blocked); catch-up scheduler (overdue jobs fire on boot).

**Gate `p4-command`** — dispatch/status buttons live with run logging · 5 intents end-to-end · token usage per run recorded, shown with `≈`, degrades honestly

---

### Phase 6 — Hardening 🔴

*Survive the real world.*

**Deliverables**
- Error/empty/loading states for every widget (empty DB, no network, no token, 50+ repos with virtualized lists where needed).
- **Playwright visual-diff** (baselines from P3.5) wired into `verify.sh`.
- **Autostart** (launchd/pm2) + **WAL-safe nightly backup**: `VACUUM INTO` (not a file copy), assert a row count before 7-copy rotation (council B5).
- `.env.example` + README quickstart takes a fresh clone → running dashboard; `/code-review high` on the full diff, fix findings.

**Gate `p6-hardening`** — `/verify` green end-to-end · empty-DB / no-network / 50-repo render honest states · visual baselines wired and passing · autostart + WAL-safe backup exist · README quickstart works from a fresh clone

---

### Phase 5 — Self-learning ⏸️ *(parked post-v1, council D2)*

*The system mines its own run history to propose improvements — deferred, not abandoned.* The **run logger already ships in Phase 3**, so the asset accumulates from day one; the analyzer is built later, once the log is thick enough to cluster on.

**Un-park precondition:** ≥100 real runs logged (raised from 25 — at solo pace, 25 heterogeneous runs is statistically nil for routing decisions). When built: nightly Haiku+Sonnet analyzer → proposal inbox (diff, evidence, apply/reject) → two charts (7-day success rate ↑, median tokens/task ↓) from a deterministic script. **Guardrail (council S6):** auto-apply is permanently barred for any class emitting executable content (verify scripts, `ops.yml`, shell) — inert formats only, via PR + a second-model injection screen. Full design retained in [`SELF_LEARNING.md`](./docs/SELF_LEARNING.md).

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
| (parked) analyzer over the run log | **Platform Phase 5/8** — Knowledge Engine + Learning Platform |
| Catch-up scheduler + automation hooks (P4) | **Platform Phase 6** — Automation Engine |
| Deterministic metrics + trend charts (post-v1) | **Platform Phase 7** — Predictive Intelligence |
| localhost + `.env` today | **Platform Phase 9** — Enterprise (orgs, SSO, distributed workers, cloud) |

**Long-term versions:** v1.0 stable platform → v2.0 autonomous AI team → v3.0 self-learning platform → v4.0 AI CTO / PM / Release Manager with autonomous planning, review, and release.

---

## Working agreement

- **Gate-driven:** run `/gate <name>` at each boundary; `.claude/ops.yml` refuses to skip. **P2.5 is the enforced off-ramp** — it can halt the project on data.
- **Commit per turn**, update [`TASK.md`](./TASK.md) each session, one learning per line in `LEARNINGS.md`.
- **Model routing:** lowest-capable model that does a coding subtask reliably; reserve the top model for architecture, gate evaluation, and stubborn debugging.
- **No loops on copy:** UI text, marketing, and naming are single-shot drafts for Isac to edit; loops run only on verifiable work.
- **No fabricated numbers:** every value traces to a stored typed event; missing data shows stale/offline; reference digits are illustrative, judged on layout not equality.
