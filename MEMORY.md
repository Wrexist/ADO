# MEMORY.md — cross-session shift log

Handoff notes between working sessions (human or agent). Newest first. Complements:
- `TASK.md` — what's done / next, per phase
- `LEARNINGS.md` — one durable lesson per line (the nightly analyzer consumes it)
- `.claude/logs/` — raw tool + session logs (gitignored)

Each entry: date · who · what shipped · what's next / watch-outs.

---

## 2026-07-12 · Claude · add-a-project from the UI + first-run clarity (whole-app easier-to-use pass)
Surveyed the complete app for install/use/understand friction (3 parallel readers). Unanimous #1:
you couldn't add a project without editing PROJECT_DIRS in .env and RESTARTING — and that one gap
cascaded (dispatch, automations, prompts, per-project pages all gate on scanned repos), while 4
prominent "New/Create" buttons dead-ended at /planned/*. Built the fix + a batch of clarity wins.
- **Runtime project management (server):** `ProjectDirsStore` (persisted JSON, like connections)
  + token-gated `GET/POST/DELETE /api/projects`. The scanner is now REBUILDABLE live
  (`rebuildScanner()`, mirror of `startGithub`) over env dirs ∪ stored dirs — add a folder →
  persist → rescan → repos stream in over SSE, no restart. Scanner also accepts EITHER a repo
  folder OR a folder-of-repos (`isGitRepo(root) ? [root] : subdirs(root)`) so "add my project"
  works whichever the user points at. Verified LIVE: `POST /api/projects` on a temp git repo →
  `{repos:1}`; bad path → 400; no token → 401. +5 tests.
- **Add-a-project UI (web):** `AddProjectPanel` (folder input → `addProject`, live result, list of
  scanned folders with remove) on `/repositories?add=1`; the 4 dead-end buttons (dashboard "New",
  top-bar "+", Ops "New Project", Quick Actions "Create Repository") now all deep-link here; the
  empty state is an "Add a project" button. `lib/projects.ts` client.
- **GitHub-first onboarding:** `FirstRunCard` now leads with **Connect GitHub** (instant, restart-
  free real data — the path was fully built but never surfaced) + "Add a local folder"; dropped the
  ".env + restart" copy.
- **Clarity bundle (survey-driven, honest):** de-personalized greetings ("Welcome back 👋",
  "Operations 👋"); fixed the misleading "Active Agents" KPI → "AI Agents" (total, with N running
  sub); added the missing "Running Agents" empty state; command box copy now honest ("Ask about
  status, or create and dispatch a task") + live suggestion chips (reuse the built-in `seed`);
  humanized the intent result chip (no raw `dispatch_task · heuristic · 82%` — plain label + tooltip);
  "Deploy Application" → "View Deployments"; Ops "AI Assistant" button → "Prompt Library"; help-card
  "Open AI Assistant" → "Ask the command center".
- **Papercuts:** `npm run demo` one-command demo; closed the two ungated setup routes
  (`/api/setup/probe`, `/api/setup/install` now require the token — the web already sends it).
- verify green (131 tests) · smoke green (0 console errors) · captured the new first-run + add panel.
- **Deferred (clear follow-ups, not done this turn):** group the ~14 `/planned/*` nav items under a
  "Soon" disclosure; Settings split Active vs "save now / activates later" (37 connectors say Saved ✓
  but only github/anthropic/slack/discord are wired); visible System-Health info icon; plain
  System-Status service names; prompt "Run in repo" dropdown shows slugs not names; AgentsPage build
  rows show raw repo id; ⌘K palette actions (Add project / Dispatch); a runtime "connect Claude
  subscription" note cross-linking Settings↔Setup (the CLI `auth login`/`status`/`setup-token`
  subcommands are REAL — verified — so Setup Sign-in is not a dead-end).

## 2026-07-12 · Claude · zero-config onboarding (was: offline until hand-configured)
Isac hit the wall: on a fresh machine the app is OFFLINE until you hand-create `.env`, generate
a token, paste it into ACC_TOKEN + VITE_ACC_TOKEN, and start the server (Setup screenshot showed
"Server offline / Failed to fetch / set VITE_ACC_TOKEN"). Killed that friction end-to-end.
- **Auto-provision `.env` (`scripts/bootstrap-env.mjs`):** idempotent + non-destructive — generates
  a strong ACC_TOKEN (crypto) and a MATCHING VITE_ACC_TOKEN only if missing; never changes an
  existing token; preserves all other keys/comments; chmod 600; never prints the token. Wired into
  EVERY start path so first run is zero-config: root `predev` (→ `npm run dev` just works), server
  `prestart` (→ autostart pm2/launchd + smoke + any `npm run start`), `install.sh`, `install-autostart.sh`,
  `smoke.sh`, and a `npm run setup` alias. Verified live: `npm run start` → prestart bootstrap →
  server boots → `/health` 200 → dashboard shows **"Live"**.
- **First-run onboarding card (`MainColumn` `FirstRunCard`):** when the server is online but zero
  repos are scanned, instead of a bare 0/0/0 grid the dashboard shows a friendly welcome — folder
  icon, "now add your projects", the real next step (`PROJECT_DIRS` in `.env`), and Open Setup /
  Settings CTAs. Honest: renders ONLY at `repos.length === 0`, so it never masks real data and the
  demo (which has repos) never shows it. Category tabs with no repos get a light EmptyState.
- Kept convention 9 intact: the server still REQUIRES a token — bootstrap just always provides one
  before start. env.ts keeps its (now clear) guard as the headless-misconfig safety net.
- README quickstart rewritten to `npm install && npm run dev` (zero-config). verify green (126
  tests) · smoke green (0 console errors) · captured a real empty-world `/command` showing the card.
- **Watch-out:** adding a project is still "edit PROJECT_DIRS + restart" (read at boot) — a runtime
  "add folder → rescan" endpoint would make it fully clickable; good next step for onboarding.

## 2026-07-12 · Claude · fixed 3 real-run bugs from the PR #1 Codex review
PR #1 merged (merge commit); an automated Codex review flagged 3 P2 bugs, all verified real
and all in real-`claude`-run paths the demo world masks. Per the merged-PR workflow, restarted
`claude/project-planning-goals-l1r23w` from `origin/main` and pushed the fixes there (a fresh
change; the merged PR is finished, not reused — no new PR opened, none requested).
- **Runner stderr deadlock (`runner/spawner.ts`):** `claude -p` was spawned with `stdio[2]='pipe'`
  but only stdout is read (readline, stream-json). A child emitting >~64KB to stderr (verbose
  diagnostics, repeated auth/tool errors) fills the pipe buffer and blocks on write → the run
  hangs until the 15-min wall-clock timeout kills it. Fix: `stdio[2]='ignore'` — can't merge into
  stdout (would corrupt the JSONL), and the UI shows only stdout, so drop it at the OS level.
- **Repo agent tag unresolvable (`runner/index.ts`):** after a run, `repo.enriched` stored the
  display string `Agent · <repo>` in `repo.agents`, but `state.agents` is keyed by `agentId`
  (=== `runId`) and the project page resolves `state.agents[aid]` — so in real runs the per-project
  Agents panel/avatar stack stayed EMPTY (demo hid it: it seeds real agent ids). Fix: store the
  `runId` (newest-first, deduped, capped at 5) so it resolves; the label lives on the agent record.
  +1 regression test (seed repo → dispatch → assert `repo.agents` holds a resolvable runId).
- **Node floor vs `process.loadEnvFile` (`env.ts`):** the built-in dotenv (no dep) needs Node
  20.12, but `engines`, CI, and docs said "20/≥20" — on 20.0–20.11 a configured install throws a
  cryptic `TypeError` before reading `.env` and can't boot. Fix: bumped the declared floor to
  `>=20.12` (package.json engines · CI `node-version: 20.12` so CI tests the real floor · README ·
  CLAUDE.md · requirements catalog) AND guarded the call with a clear "needs Node >=20.12" error.
- verify green (typecheck ×3 · lint · 126 tests · build). No demo-visible render change (real-run +
  boot-path + docs only), so no new screenshots — they'd be identical to the last set.
- **Watch-out:** the send_later PR check-in (trig from earlier) couldn't be deleted (permission
  stream hiccup); it's self-cancelling — when it fires it'll see the PR merged and stop.

## 2026-07-12 · Claude · three real features: deploy status · notifications · LLM parser
Built + shipped the three the user asked for, pushed together.
- **Per-repo deploy status (Feature 1):** `latestDeployment(state, repoId)` selector →
  RepoCard meta row shows the most recent real deploy (env label, tinted by `deploy.ok`,
  timestamp title). Repo cards are now the click target → `/repositories/:id` (role=button,
  Enter/Space); the "Automate" corner button stays (stopPropagation). Absent deploy = no chip
  (honest — never a placeholder). BuildQueue resolves `build.repo` id→name.
- **Outbound notifications (Feature 2):** `Notifier` pings connected Slack/Discord incoming
  webhooks on real CI failures + deployments (Slack `{text}` / Discord `{content}`), 60s
  per-event dedup against flapping CI, 5s fetch timeout, failures logged never thrown.
  Connecting a webhook in Settings IS the opt-in. Webhook URL is a server-resolved secret,
  never sent to the client; message text is composed from typed event fields, not echoed
  external input. Wired into one consolidated bus subscription (build.updated non-runner →
  automation engine + notifier; deploy.recorded → notifier), gated off in demo/hermetic tests.
- **LLM-backed command parser (Feature 3):** `ClaudeParser` — when an Anthropic key is
  connected, the command box classifies NL via the Messages API with a FORCED tool call
  (structured output) validated by the shared `Intent` schema; **falls back to the heuristic
  parser** with no key / on any API error/timeout / on invalid output, so the box never breaks
  and `parsedBy` stays honest. Thin fetch adapter pinned to `anthropic-version: 2023-06-01`
  with an injectable FetchFn seam (convention 12: versioned adapter + honest degraded state) —
  no new server dependency. Command text is data, not instructions: it rides in the user turn,
  the system prompt frames it as text to classify only, and hallucinated repo ids (outside the
  known set) are dropped (convention 11). Model `claude-haiku-4-5` (configurable) — a 5-way
  classification is the canonical cheap/fast case (convention 5). 6 tests (no-key fallback,
  successful classify, hallucinated-id drop, API-error/invalid-output/network fallbacks).
- verify green (typecheck ×3 · lint · 125 tests · build).
- **Next / watch-outs:** the live Messages API call isn't exercised in CI (needs a real key) —
  logic + fallbacks are fully tested via the injected fetch. Notifier live POST likewise tested
  via injected PostFn. If Isac wants opus-tier parsing for fuzzier commands, the model is a
  constructor arg — flip `DEFAULT_MODEL` or pass it at construction.

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
