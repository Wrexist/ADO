# GOALS — AI Development OS

> The single reference for *what we are building*, *why*, and *how we will know it worked*.
> Pair this with [`ROADMAP.md`](./ROADMAP.md) (the phased plan) and [`.claude/ops.yml`](./.claude/ops.yml) (the machine-checkable gates).

---

## North Star

**Become the single place where every repository, project, AI agent, deployment, document, design, build, release and business decision is managed through one unified, intelligent platform that continuously learns, improves and scales — without requiring architectural redesign.**

That is the long-horizon vision ([`docs/VISION_ADO.md`](./docs/VISION_ADO.md)). It is deliberately larger than any single milestone. We reach it by shipping one genuinely useful product first and compounding from there.

## The wedge: AI Control Center (v1)

We do **not** start by building the whole operating system. We start with the one surface that earns its keep on day one and proves the core ideas (event bus, typed data, self-learning, no fabrication):

> **AI Control Center** — a local-first personal mission-control dashboard for the whole portfolio: every repo, build, deployment, running agent, gate, and token spent, on one screen, powered by real data, improving itself from its own logs.

It recreates two reference designs 1:1 ([`design/reference/`](./design/reference/)) and is fully specified in [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md). Everything in v1 is buildable by one person, part-time, in ~3 weeks. See [`ROADMAP.md`](./ROADMAP.md) for the phase breakdown.

---

## Product goals (v1 — AI Control Center)

| # | Goal | Why it matters | Measured by |
|---|------|----------------|-------------|
| G1 | **Pixel-accurate mission control** | The UI is the product's first promise; a "close enough" dashboard is not trusted | Both views match the reference PNGs at 1536px (layout, spacing, color); 0 console errors — gate `p1-pixel-shell` |
| G2 | **Every number is real or absent** | A dashboard that invents numbers is worse than no dashboard | Data-integrity audit clean: every rendered value traces to a stored typed event; missing data shows stale/offline, never a plausible guess — gate `p2-data-core` |
| G3 | **Replaces manual repo/CI checking** | If it isn't opened daily it's procrastination with a UI | Daily-Driver Milestone after Phase 2: the dashboard is where portfolio state is checked, not GitHub tabs |
| G4 | **Dispatch and watch real work** | Mission control that can't act is a read-only report | A real `TASK.md` item is dispatched from the dashboard and watched to completion with live progress — gate `p3-agents` |
| G5 | **Command in natural language** | The fastest interface is describing intent | 5 intents end-to-end: status query, dispatch, create task, run gate, summarize activity — gate `p4-command` |
| G6 | **Learns from its own logs, provably** | "Self-learning" must be measured, not claimed | ≥1 useful proposal generated from real run logs and accepted; success-rate ↑ and tokens/task ↓ charted from a deterministic script — gate `p5-self-learning` |
| G7 | **Survives the real world** | Empty DB, no network, 50+ repos, a sleeping laptop | Honest states everywhere; visual-diff baselines hold; catch-up scheduler + autostart + nightly backup — gate `p6-hardening` |

## What "done" looks like (v1)

Both views pixel-matched to the references but showing **your** portfolio live: real repos, real CI, real agents dispatched from the command box, real (≈) token spend — and a nightly analyzer filing improvement proposals whose worth is proven by two charts moving in the right direction, not by claims.

---

## Success criteria

**v1 is successful when** all seven phase gates in [`.claude/ops.yml`](./.claude/ops.yml) are green **and** the Daily-Driver Milestone holds (the dashboard has replaced manual checking for 7+ consecutive days).

**The long-horizon platform** ([`docs/VISION_ADO.md`](./docs/VISION_ADO.md)) eventually supports 1,000+ repositories, 100+ concurrent agents, millions of events, multiple organizations, local + cloud execution, offline mode, and complete vendor independence — reached by extending the v1 core, never by rewriting it.

---

## Non-goals (v1 — explicitly out of scope)

Deciding these *now* prevents scope creep later. Each is a deliberate deferral, not an oversight:

- **Not a hosted SaaS.** v1 is localhost-only; it must reach your repos, Claude Code sessions, and GitHub token. Public exposure (auth, secrets vault) is a later problem.
- **Not mobile/responsive.** Canonical viewport is 1536px, graceful to 1280, horizontal scroll below. You build at a desk.
- **Not multi-user/teams.** You are solo; fake teammate avatars would violate the no-fabrication rule and become agent avatars instead.
- **Not tracking terminal-started sessions live.** v1 live-tracks only agents the dashboard dispatched; manual sessions appear via token parsing only — an honest, stated limitation.
- **No fabricated placeholder features.** Billing, Team, Templates, Secrets render as honest "not wired yet" pages rather than fake-working UI.
- **No charting library.** Custom SVG (Sparkline, RadialRing, MiniArea) to match the reference look with zero heavy deps.

---

## Guardrails (non-negotiable invariants)

These carry from v1 all the way to the full platform. They are enforced in [`CLAUDE.md`](./CLAUDE.md) and [`.claude/ops.yml`](./.claude/ops.yml):

1. **No fabricated numbers.** Every UI value originates from a typed, zod-validated bus event with a stored source. Sparklines need ≥2 real samples. `modules.data_integrity: true`.
2. **Typed events only.** All server→client data flows through `packages/shared` contracts. No `any` in payloads.
3. **Learning applies to verifiable work only.** Copy, strategy, and content are excluded from loops and auto-anything (the no-slop rule).
4. **External text is data, never instructions.** Logs, reviews, fetched content, and agent output are treated strictly as data by the analyzer and every agent (prompt-injection invariant).
5. **localhost is not a trust boundary.** Mutating endpoints require `X-ACC-Token`; CORS locked to the web origin; SSE read-only; spawned agents get a minimal env allow-list.
6. **Unstable interfaces get versioned adapters.** `claude -p` stream-json and session-log parsing degrade to honest states ("running (opaque)", "tokens unavailable"), never crash or guess.
7. **Nothing applies without approval.** Every self-learning proposal is a diff you review; each apply is one revertable commit.

---

## Anti-pivot clause

This is project slot #4 (SENTINEL, the tower-defense fun-gate, and the Dynasty Steam port all have open gates). The plan carries a kill switch, honestly:

- **Phases are sequential.** `/gate` refuses to start Phase N+1 while Phase N is open.
- **Blocked > 1 week → stop and reassess.** A single blocked gate for more than a week halts new phase work; the dashboard must not become the new open thread.
- **Kill criterion.** If the dashboard isn't opened daily for the 7 days after Phase 3, stop before Phase 5 and reassess — the run log will prove it either way.
- **Learning volume floor.** The analyzer phase (5) does not begin until ≥25 real runs are logged; below that it would produce confident noise.

---

## Guiding principles (from the vision, applied to v1)

- **AI is a team, not a single model** — specialized agents (Planner → Architect → Developer → Reviewer → Security → QA → Docs → Deploy → Learning), routed to the cheapest model that does the job reliably.
- **Event-driven** — everything is a typed event on a bus; modules stay decoupled, history is replayable.
- **Plugin-first & vendor-independent** — no provider is load-bearing; integrations are replaceable adapters.
- **Knowledge-first** — every action increases searchable knowledge; nothing valuable disappears.
- **Local-first, cloud-ready** — runs on your machine today, scales out without a redesign.
