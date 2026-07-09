# TASK.md — AI Development OS

Living tracker. Updated every session. Current phase drives what's actionable; `/gate` refuses Phase N+1 while N is open.

**Current phase: 0 — Foundation** 🟡

---

## In progress (Phase 0)
- [x] Materialize & organize the locked plan package into the repo (docs/, design/reference/, .claude/, CLAUDE.md, .env.example)
- [x] Author `GOALS.md` (goals, success criteria, non-goals, guardrails, anti-pivot clause)
- [x] Author `ROADMAP.md` (7 phases with gates + rollup into the platform vision)
- [x] Author root `README.md` + doc index; living `TASK.md`
- [x] Scaffold npm-workspaces monorepo skeleton: `apps/web`, `apps/server`, `packages/shared`
- [x] `packages/shared/tokens.ts` from DESIGN_SPEC §tokens; zod event-contract skeleton
- [x] `scripts/verify.sh` (typecheck · lint · test · build); `.gitignore`
- [x] `npm install` and prove `verify.sh` green end-to-end — typecheck (3 workspaces) · test 2/2 · web prod build · server boots on `/health` + SSE `/events`
- [ ] **Prompt 0.2 — plan council** against the FINAL plan (incl. AUDIT amendments); merge findings, address blockers, get approval before Phase 1
- [ ] **Prompt 0.3 — mock-data module**: typed fixtures for every widget using real project names (SENTINEL, Dynasty Manager, tower-defense, Atlas, Singularity Inc, Bloom)
- [ ] Create `.env` from `.env.example` (GitHub PAT: repo + actions:read · ACC token: `openssl rand -hex 24`)
- [ ] **Gate `p0-foundation`** → run `/gate p0-foundation`

## Next (Phase 1 — Pixel shell) — do not start until p0 is green
- [ ] Prompt 1.0 — shared component kit first (+ custom SVG Sparkline/RadialRing/MiniArea, self-hosted Inter, `/kit` demo route)
- [ ] Prompts 1.1–1.3 — View A (`/command`) on mock data, side-by-side polish vs `view-a.png`
- [ ] Prompt 1.4 — View B (`/ops`) on mock data, side-by-side polish vs `view-b.png`
- [ ] Prompt 1.5 — quality floor (⌘K, focus, reduced-motion, 0 console errors) → **Isac visual sign-off logged here** → `/gate p1-pixel-shell`

---

## Decisions log
- 2026-07-07: plan v2 locked after 3-pass audit (see `AUDIT.md`). Canonical viewport 1536. View B descope lever named. Kill criterion accepted.
- 2026-07-09: project kickoff. Repo restructured — `Plan_codex` → `docs/VISION_ADO.md`; source zip archived to `docs/archive/`; plan package materialized into `docs/`, `design/reference/`, `.claude/`. `GOALS.md` + `ROADMAP.md` authored as the goals-and-phases foundation. Phase 0 monorepo skeleton scaffolded.

## Blocked
- (none) — Phase 0 scaffold verified green in the build environment. `npm audit` reports dev-dependency advisories (vite/esbuild chain); triaged in Phase 6 hardening, not blocking.

## Notes
- Terminal-started Claude sessions are **not** live-tracked in v1 (honest limitation; token parsing only).
- Billing / Team / Templates / Secrets render as honest "not wired yet" pages — no fake features.
