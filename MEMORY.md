# MEMORY.md — cross-session shift log

Handoff notes between working sessions (human or agent). Newest first. Complements:
- `TASK.md` — what's done / next, per phase
- `LEARNINGS.md` — one durable lesson per line (the nightly analyzer consumes it)
- `.claude/logs/` — raw tool + session logs (gitignored)

Each entry: date · who · what shipped · what's next / watch-outs.

---

## 2026-07-12 · Claude · self-review: fixed a spawn-hang bug
- Reviewed the process-spawning code shipped this session (it runs shell/agents on the user's
  machine). Found a real bug: the setup-installer + review runner merged stdout+stderr and ended
  the stream only when BOTH emitted `end` — a missing binary (ENOENT) fires `error` with no
  `end`, so the reader hung forever and the run stuck at "running". Real risk for the review
  runner (`claude ultrareview` when the CLI isn't on PATH).
- Fix: extracted `apps/server/src/lib/spawnMerged.ts` — merges + ALWAYS ends the stream on
  child `close`/`error` — and used it in both install.ts and review/runner.ts (DRY). Added a
  regression test (missing binary must terminate, not hang; real command streams output + exit).
  verify green (+2 tests). No UI change.

## 2026-07-12 · Claude · whole-app consistency polish
- Swept every page for shell/width/copy/state consistency. The app was already disciplined
  (PageShell on all sub-pages, tokens-only — zero raw hex, uniform h1/subtitle headers,
  consistent icon-tile empty states), so the pass was mostly verification. The one real
  outlier: **SettingsPage** used custom chrome at `max-w-[1040px]` with "← Back to dashboard".
  Converted it to `PageShell` → now shares the exact shell (TopBar + StaleBanner + 1100px +
  "← Dashboard") with every other sub-page; its Setup link moved to the shell `actions` slot.
- Hardened nav highlighting: `isNavActive(to, pathname)` (in selectors) matches a parent route
  on a sub-path (so a future sidebar on `/repositories/:id` lights up "Repositories"); wired
  into both sidebars. Exact-match behaviour preserved for the current /command · /ops sidebars.
- Smoke now also captures `/settings` (was uncovered). verify + smoke green, 0 console errors.
- PromptsPage left as-is: already visually identical to a PageShell page (1100px, standard
  header, "← Dashboard") — converting was pure internal churn with regression risk, no visible gain.

## 2026-07-12 · Claude · richer demo + deep-review (ultrareview)
- **Enriched demo fixtures** so the project page is fully populated: demo builds now carry the
  repo id (was the display name → didn't match `build.repo===id`), and demo `repo.agents` map
  the fixture's role ids (builder/reviewer/…) to real seeded agent ids so the Agents panel
  resolves full AgentTiles. Fixed a latent real-use bug this exposed: `BuildQueue` showed
  `build.repo` raw (an id in production) — now resolves id→name (`state.repos[id]?.name`).
- **Deep review (opt-in multi-agent):** `ReviewRunner` spawns `claude ultrareview` (cloud
  multi-agent branch review — the one real headless multi-agent CLI) in the repo's cwd, streamed
  via `POST /api/projects/:id/review` + `GET /api/review/:runId` (token-gated, cwd allow-listed,
  minimal env, 15-min cap). Output shown raw/honestly (no parsed findings we can't guarantee).
  Project page gets a "Run deep review" card with a subscription-cost note. Manual only — never
  an automation trigger. 4 tests (gating/poll; no real spawn). Can't verify the live run here
  (spends tokens + needs the CLI) — logic + endpoints tested, execution is on the user's machine.
- verify + smoke green; project page now shows builds + agents + the review card (screenshot).

## 2026-07-12 · Claude · repoId on activity/deploy → per-project feeds
- Closed the data gap: added optional `repoId` to the `ActivityItem` + `Deployment` zod
  contracts (optional = old persisted events still replay). Set it in the emitters (runner
  activity, github-sync deployments) and in the demo seed (mapped from the fixture's repo
  display-name → id). The project page (`/repositories/:id`) now shows **Recent activity** and
  **Deployments** for that repo; still honest empty states where absent. +1 reducer test.
- **Demo-staleness bug found + fixed:** the demo seed uses stable event ids, and the smoke
  booted against the persisted `acc.sqlite` (DB_PATH set in .env), so `bus.publish`'s
  `onConflictDoNothing` skipped the re-seed → new `repoId` never landed (the classic
  stable-id-blocks-updates trap). Fixes: (a) `env.ts` now defaults `--demo` to an in-memory db
  unless DB_PATH is set (fresh fixture, no mixing with real data); (b) smoke.sh forces
  `DB_PATH=:memory:` so screenshots always reflect the current seed. Root-caused via the raw
  SSE snapshot (had zero repoId) + the "compacted 3 rows" log (proved a file db, not :memory:).
- verify + smoke green; per-project activity + deployments confirmed in the screenshot.

## 2026-07-12 · Claude · Project command page (single-pane per repo)
- New `/repositories/:id` — one clean screen per project tying together everything that IS
  honestly repo-scoped: header strip (category · status · branch · language · stars · PRs ·
  CI bar), **Dispatch an agent** box (real `claude -p` via the runner), Recent builds
  (state.builds where repo===id), Agents (repo.agents → state.agents), and this repo's
  Automations with Run + Manage. Repo cards (dashboard + Repositories) are now the click
  target → the project page (accessible: role=button, tabIndex, Enter/Space); the corner
  "Automate" shortcut stays (stopPropagation). ⌘K repo results point here too.
- **Honest data gap (left as empty states, not faked):** activity + deployments have no
  repoId in their contracts, so they're omitted from the per-project view rather than matched
  by name. Worth a future event-contract change (tag activity/deploy with repoId) to enrich it.
- **Workflow fan-out finding:** the `.claude/workflows` recipes are a Claude Code SESSION
  feature — there is no headless CLI to run them as multi-agent fan-out (`claude --help` has
  no workflow command; only `ultrareview` is a real headless multi-agent path). So the app
  can't drive true fan-out; workflow automations stay single-agent-follows-the-recipe. Don't
  claim otherwise. If asked again, offer wiring `claude ultrareview` as an opt-in review action.
- verify + smoke green (added /repositories/sentinel to the smoke set).

---

## 2026-07-12 · Claude · Automations polish (sources · edit · per-repo deep-link)
- Source picker in the add/edit form: **Templates · Prompt Library · Workflows · Custom**.
  Workflows are now bindable — picking a recipe prefills a single-agent task built from its
  meta (goal + phases), honestly labelled "full multi-agent version runs in Claude Code".
  Prompt-Library entries prefill from `body` (editable {placeholders}).
- **Edit** any automation in place (was delete+recreate) — the form reopens prefilled and
  saves by id. Pause/Enable/Run now/Delete unchanged.
- Per-repo entry point: every RepoCard (command dashboard + Repositories) gets an "Automate"
  action → `/automations?repo=<id>&new=1`, which filters the page to that repo and opens the
  form preselected. `?repo=` shows a "Showing: <repo> · Show all" chip.
- No server change — automations still store the final task string + dispatch it; source
  {kind,ref} is display-only. verify + smoke green (form + workflow-tab captured, 0 console errors).

---

## 2026-07-12 · Claude · Per-repo Automations (+ mobile/game templates)
- New `/automations` (replaces the `/planned/automation` stub): bind a prompt/recipe to any
  repo and run it **on command · on a schedule · on a CI event**. A run = a real dispatched
  `claude -p` agent in that repo (same runner as the command center) — never fabricated output.
- Shared: `Automation` + `AutomationTrigger` (manual/schedule{hour,day,week}/event{build.failed,
  build.success}) + `AUTOMATION_TEMPLATES` — one-click "standard prompts" incl. the mobile/game
  pieces (nightly playtest bug-hunt, balance pass, patch notes, Steam release readiness,
  TestFlight prep, App Store metadata, perf+a11y audit, crash triage, fix-the-failed-build,
  weekly changelog, dep/security). Pure helpers `isScheduleDue` / `eventMatches`.
- Server: `automations/store.ts` (JSON, CRUD) + `automations/engine.ts` (runNow / onBuildEvent /
  tickScheduled, 2-min debounce, dispatch-failure caught). Event triggers subscribe to the bus
  but **ignore runner-origin builds (`source.kind==='runner'`) so an automation can't retrigger
  itself** — no loops. Scheduled via an hourly `automations-tick` scheduler job. 5 endpoints,
  token-gated. 12 tests. `--demo` seeds 4 example automations so the page is self-documenting.
- Web: `AutomationsPage` (list grouped by repo, template-picker add-form, trigger dropdown,
  Run now / Pause / delete). Wired into both sidebars + ⌘K.
- **Couldn't fetch the X article** (x.com 403 unauth; syndication also 403; search didn't
  surface that author) — built the templates from established 2026 Claude-Code mobile/game
  practice, NOT from the tweet. If Isac pastes the text, fold its specifics in.
- **Next / watch-outs:** event triggers cover build.failed/success (clean repo mapping via
  build.repo); deploy events skipped (no reliable repo mapping yet). Workflows aren't auto-run
  (they're a Claude Code construct) — automations dispatch prompts; a workflow binding would
  dispatch its recipe as a single-agent prompt. Live event/scheduled dispatch needs the claude
  CLI + scanned repos (unverified in CI, same as the runner).

---

## 2026-07-12 · Claude · Setup — real buttons over copy-commands
- Per Isac: replace copy-commands with real Install/Connect buttons. Expanded the one-click
  allow-list beyond npm/VS-Code-ext to **Homebrew** (`brew install` / `brew install --cask` →
  git, gh, VS Code) and a real **Sign in** button for Claude (`claude auth login`).
- `claude auth status` returns `{loggedIn}` → the Claude sign-in item now has REAL detection
  (was "manual"); `claude auth login` opens the browser to complete OAuth on the user's machine.
- Installability is gated on the tool being present (npm always · `code` for ext · `brew` for
  formula/cask · `claude` for sign-in), detected once per probe via `detectCapabilities()`.
  Where the package manager is absent it falls back to the one-line command + link — the honest
  ceiling: a server can't non-interactively install a system pkg without a package manager (apt
  needs sudo), so no fake button. Install timeout bumped to 10 min (casks/sign-in are slow);
  install child env gains DISPLAY/BROWSER so sign-in can open a browser on Linux desktops.
- 16 setup tests (brew/cask/sign-in command derivation + capability gating). verify + smoke green.
- **Watch-out:** on a machine without Homebrew (e.g. this container, bare Linux) git/gh/VS Code
  still show the guided command — that's honest, not a regression. Most macOS devs have brew.

---

## 2026-07-12 · Claude · Setup page + Workflows visual
- **Setup page (`/setup`, linked from Settings + both sidebars):** a typed requirements
  catalog (`@ado/shared/requirements` — runtime · CLI · extensions · apps · accounts · config)
  the local server PROBES for real (`node/git/claude --version`, VS Code ext list, connection
  store, env) → honest installed/missing/manual/version per item, never fabricated. One-click
  **Install** for the auto-installable ones (npm globals, VS Code extension when `code` is on
  PATH) via a token-gated, **allow-listed** endpoint (client sends an `id`; the command is
  derived server-side from the catalog, never client input) with streamed progress; guided
  copy-command + install-link for GUI apps and account sign-ins. This surfaces the real
  "connect your subscription" truth: the runner uses the **`claude` CLI's own login**, not a
  pasted API key.
- **Workflows page (`/workflows`, replaces the `/planned/workflows` stub):** the server reads
  the real `.claude/workflows/*.js` `meta` blocks (balanced-brace extraction of just the
  literal) → `GET /api/workflows` → the page renders each recipe as a numbered phase pipeline.
  Sourced from the files, so the visual can't drift.
- Nav wired in both sidebars + ⌘K; `workflows` removed from the planned registry; Ops
  "Run Workflow" → "View Workflows" → `/workflows` (honest — they run in Claude Code, not the app).
- **Bug the gate caught:** `POST /api/setup/probe` with `content-type: application/json` but no
  body → Fastify 400 (twice, via StrictMode double-effect). Fixed by sending `{}`. Smoke now
  also screenshots `/workflows` + `/setup` at 1536px (zero console errors).
- **Next / watch-outs:** the one-click Install path runs real `npm i -g` / `code --install-extension`
  on the host — verified logic + endpoints in tests, but the live install itself isn't exercised
  in CI (would mutate the runner's global env). Consider a per-requirement "why it's not
  auto-installable" tooltip and detecting the `claude` login state if a reliable signal exists.

---

## 2026-07-12 · Claude · workflows + CI
- Added `.claude/workflows/` — six opt-in orchestration recipes (Claude Code Workflow scripts):
  `understand` (parallel cited map), `ship-feature` (map → judge-panel design → vetted plan),
  `review` (diff, adversarial-verify per finding), `audit` (whole-repo sweep → dedupe → verify →
  fix list), `harden` (loop-until-dry hunt, 3-lens majority vote), `verify-gate` (verifier agent
  runs verify+smoke ∥ convention audit ∥ completeness critic → pass/block). Each lens IS a
  CLAUDE.md convention; every finding must survive an agent trying to refute it. `README.md` documents them.
- Added `.github/workflows/ci.yml` — mirrors the local gate (`npm run verify`) on PR + main push;
  Node 20 floor, `permissions: contents: read`, `npm ci` from lockfile, cancel-in-progress. Smoke
  stays local (needs ACC_TOKEN + browser); CI doesn't fabricate a pass it can't run.
- Validated all six scripts compile in the harness's async-function context (not `node --check`,
  which wrongly rejects the top-level `return`/`await` the harness wraps) and lint clean; ci.yml YAML parses.
- **Next / watch-outs:** workflows are authoring-only so far — none executed (no multi-agent opt-in
  given this round). First real run should be `review` on a diff to confirm the fan-out + verify pass end-to-end.

---

## 2026-07-12 · Claude · LOOPKIT harness adopted
- Adopted the LOOPKIT `.claude/` harness, tailored to this repo: `settings.json`
  (permissions + hooks), `hooks/` (pre/post/stop "reflexes", fail-open), `agents/verifier.md`
  (independent shift-notes cop), `skills/` (9 tracks: agent-llm, debug, security, frontend,
  testing, refactor, docs, data, git-ops), root `.mcp.json`, this `MEMORY.md`, `run.sh`,
  `install.sh`. Existing `.claude/ops.yml` + root `CLAUDE.md` were preserved.
- Earlier same-day rounds: audit-and-fix (real bugs — SSE token-leak to logs, runner
  slot-leak, scanner/GitHub stale-id dedup, unbounded builds); dead-nav clearout (real
  `/repositories` `/agents` `/deployments` `/activity` pages + `/planned/:slug` placeholders +
  a ⌘K command palette); real ESLint gate; event-sourced stat-card trend deltas; Tone enum +
  timestamp validation; dropped the `snapshots` table + boot event-log compaction; and every
  remaining chrome interaction wired (layout/sort toggles, row menus, top-bar icons).
- **Next / watch-outs:** `p2.5` (one week of real daily use) + `p3` (a real `claude -p` run) are
  Isac's to close; `p3.5` pixel-diff baselines wait for the visual sign-off. Turn real
  `/planned/*` placeholders into features as prioritized.

---

## Template — copy for each session
## YYYY-MM-DD · who · title
- shipped: …
- next / watch-outs: …
