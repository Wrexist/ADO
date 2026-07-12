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
│                   SSE client · routes: /command, /ops, /prompts, /settings
├── apps/server     Fastify + TS · SQLite (drizzle) · SSE stream
│   ├── integrations/   github · sysmon · health
│   ├── scanner/        walks PROJECT_DIRS: git status, ops.yml, TASK.md, gates
│   ├── runner/         spawns `claude -p --output-format stream-json` (headless agents)
│   ├── command/        NL → intent → read-now / confirm-to-mutate · token rollup
│   ├── scheduler/      catch-up jobs (last-run persisted, overdue fires on boot)
│   ├── backup/         WAL-safe nightly backup (VACUUM INTO + row-count assert + rotation)
│   ├── connections/    secure per-service key store (gitignored, mode 600)
│   ├── prompts/        custom prompt-library entries (built-ins ship in shared)
│   └── learn/          run logger · nightly analyzer · proposal inbox (parked)
└── packages/shared     typed event contracts (zod) · design tokens · prompt library · connectors
```

Data flow: integrations + scanner + runner emit **typed events** → SQLite (history) + SSE (live UI). The web app renders only what arrived through the bus. **Every number on screen traces to a source event — a dashboard that invents numbers is worse than no dashboard.**

---

## Status

**Phase 6 — Hardening (in progress).** The dashboard is functional end-to-end on branch `claude/project-planning-goals-l1r23w`: live repo scanning, GitHub enrichment, system monitoring, a natural-language command center, headless agent dispatch, a Settings/Connections page for 36 services, and a model-optimized **Prompt Library**. Gates `p0`/`p1`/`p2`/`p3`(simulated)/`p4` are passed; `p2.5` (one week of real daily use) and the real-`claude -p` confirmation of `p3` are Isac's to close on a machine with credentials.

Recently landed: the Prompt Library (`/prompts`) with per-model tuning + trained game/mobile/Steam/app agents, a catch-up job scheduler, and WAL-safe nightly DB backups.

Current state is always in [`TASK.md`](./TASK.md); phase gates are in [`.claude/ops.yml`](./.claude/ops.yml).

---

## Quickstart

```bash
# 1. Install (npm workspaces)
npm install

# 2. Configure secrets (never commit .env)
cp .env.example .env
#   ACC_TOKEN         — openssl rand -hex 24  (REQUIRED; the server refuses to boot without it)
#   VITE_ACC_TOKEN    — set to the SAME value as ACC_TOKEN
#   GITHUB_TOKEN      — PAT with repo + actions:read   (optional; GitHub sync stays off until set)
#   ANTHROPIC_API_KEY — intent parser + analyzer only  (optional)
#   PROJECT_DIRS      — comma-separated dirs containing your repos to scan

# 3. Verify the toolchain is green (typecheck · lint · test · build)
npm run verify

# 4. Run web + server (http://localhost:5173)
npm run dev
```

**Just want to see it?** `npm run start -w @ado/server -- --demo` seeds a deterministic
fixture world, then `npm run dev -w @ado/web` — every widget renders with sample data and
no credentials. Prefer connecting your own keys? Open **Settings → Connections** in the app.

The server binds `127.0.0.1` only. Secrets live in `.env` (gitignored), never in code; keys
you add in Settings are stored in a gitignored `data/` file (mode 600) and never sent to the browser.

### Keep it running (autostart)

```bash
npm run autostart      # macOS → launchd LaunchAgent; Linux → pm2 (auto-detected)
```

Starts the server (and, via pm2, a web preview) on login. See [`deploy/`](./deploy/) for the
raw configs. On Linux, run the one-time `pm2 startup` command it prints to persist across reboots.

### Visual smoke

```bash
npm run smoke          # boots the --demo world, screenshots /command · /ops · /prompts, fails on any console error
```

A stable render + zero-console-error gate (screenshots land in `smoke-shots/`). Requires
`ACC_TOKEN` + `VITE_ACC_TOKEN` in `.env`.

---

## Working agreement (the short version)

- **Gate-driven & sequential** — `/gate` refuses to start Phase N+1 while N is open.
- **No fabricated numbers** — every value traces to a stored typed event; missing data shows stale/offline.
- **Model routing** — cheapest model that does the job reliably; top model reserved for architecture, gates, and stubborn debugging.
- **No loops on copy** — UI/marketing text is a single-shot draft to edit; loops run only on verifiable work.
- **Commit per turn**, update `TASK.md`, one learning per line in `LEARNINGS.md`.

See [`CLAUDE.md`](./CLAUDE.md) for the full set.
