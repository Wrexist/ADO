# AI Development OS

Local-first mission control for the whole Wrexist portfolio — every repo, build, deployment, running agent, gate, and token spent on one screen, powered by real data, improving itself from its own logs.

The long-horizon aim is a full **AI Development OS** where humans and AI collaborate to plan, build, review, deploy, monitor and improve software across unlimited repositories. We get there by shipping one genuinely useful product first: the **AI Control Center** dashboard.

> **New here? Read in this order:** [`GOALS.md`](./GOALS.md) → [`ROADMAP.md`](./ROADMAP.md) → [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md).

---

## Documentation map

| Doc | What's in it |
|-----|--------------|
| [`GOALS.md`](./GOALS.md) | North star, product goals, success criteria, non-goals, guardrails, anti-pivot clause |
| [`ROADMAP.md`](./ROADMAP.md) | The 7-phase plan with go/no-go gates + how v1 rolls up into the platform vision |
| [`CLAUDE.md`](./CLAUDE.md) | Conventions for anyone (human or agent) working in this repo |
| [`.claude/ops.yml`](./.claude/ops.yml) | Machine-checkable phase gates, thresholds, data-integrity switch (run with `/gate`) |
| [`TASK.md`](./TASK.md) | Living task tracker — updated every session |
| [`AUDIT.md`](./AUDIT.md) | Three adversarial review passes that hardened the plan |
| [`docs/VISION_ADO.md`](./docs/VISION_ADO.md) | The full long-horizon platform vision (formerly `Plan_codex`) |
| [`docs/MASTER_PLAN.md`](./docs/MASTER_PLAN.md) | v1 vision, architecture, phases, honest constraints |
| [`docs/DESIGN_SPEC.md`](./docs/DESIGN_SPEC.md) | 1:1 spec of both reference screens: tokens, layout, components |
| [`docs/DATA_MAP.md`](./docs/DATA_MAP.md) | Every widget → its real data source and the phase it goes live |
| [`docs/SELF_LEARNING.md`](./docs/SELF_LEARNING.md) | The learn-by-itself loop: sense → analyze → propose → review → measure |
| [`docs/PROMPTS.md`](./docs/PROMPTS.md) | 18 copy-paste Claude Code build prompts, Phase 0 → 6 |
| [`design/reference/`](./design/reference/) | The two reference designs (`view-a.png`, `view-b.png`) — Phase 1 matches these 1:1 |

---

## Architecture (v1)

```
ai-development-os/            (monorepo, npm workspaces)
├── apps/web        Vite + React 18 + TS + Tailwind + Zustand
│                   SSE client · two routes (/command, /ops)
├── apps/server     Fastify + TS · SQLite (drizzle) · SSE stream
│   ├── integrations/   github · claude-usage · sysmon
│   ├── scanner/        walks PROJECT_DIRS: git status, ops.yml, TASK.md, gates
│   ├── runner/         spawns `claude -p --output-format stream-json` (headless agents)
│   └── learn/          run logger · nightly analyzer · proposal inbox
└── packages/shared     typed event contracts (zod) · design tokens
```

Data flow: integrations + scanner + runner emit **typed events** → SQLite (history) + SSE (live UI). The web app renders only what arrived through the bus. **Every number on screen traces to a source event — a dashboard that invents numbers is worse than no dashboard.**

---

## Status

**Phase 0 — Foundation (in progress).** The monorepo scaffold, tokens, and planning are landing on branch `claude/project-planning-goals-l1r23w`. Next: run the plan council (Prompt 0.2) and build the mock-data module, then open Phase 1.

Current state is always in [`TASK.md`](./TASK.md); phase gates are in [`.claude/ops.yml`](./.claude/ops.yml).

---

## Quickstart

> Full setup lands with Phase 0. Today the scaffold builds and typechecks; live data arrives in Phase 2.

```bash
# 1. Install (npm workspaces)
npm install

# 2. Configure secrets (never commit .env)
cp .env.example .env
#   GITHUB_TOKEN  — PAT with repo + actions:read
#   ANTHROPIC_API_KEY — intent parser + analyzer only
#   ACC_TOKEN     — openssl rand -hex 24
#   PROJECT_DIRS  — comma-separated dirs containing your repos

# 3. Verify the toolchain is green
bash scripts/verify.sh

# 4. Run web + server
npm run dev
```

The server binds `127.0.0.1` only. Secrets live in `.env` (gitignored), never in code.

---

## Working agreement (the short version)

- **Gate-driven & sequential** — `/gate` refuses to start Phase N+1 while N is open.
- **No fabricated numbers** — every value traces to a stored typed event; missing data shows stale/offline.
- **Model routing** — cheapest model that does the job reliably; top model reserved for architecture, gates, and stubborn debugging.
- **No loops on copy** — UI/marketing text is a single-shot draft to edit; loops run only on verifiable work.
- **Commit per turn**, update `TASK.md`, one learning per line in `LEARNINGS.md`.

See [`CLAUDE.md`](./CLAUDE.md) for the full set.
