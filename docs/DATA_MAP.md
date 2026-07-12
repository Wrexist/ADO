# DATA_MAP.md — every widget → its real source

Rule: a widget ships mock (Phase 1) → real (its phase below) → never "plausible". If the source is down, show stale-with-timestamp or offline — not yesterday's number pretending to be live.

| Widget | Source | Phase | Notes |
|---|---|---|---|
| Total repositories / repo cards / projects table | GitHub API (octokit) ∩ local scanner over `~/dev` | 2 | scanner reads git status, ops.yml (category, gates), TASK.md; GitHub adds stars, PRs, default branch |
| Build & Test progress bars | GitHub Actions latest run per repo | 2 | map: queued 10% amber · in_progress 50% amber · success 100% green · failure red; label = workflow name |
| Language dot | GitHub `language` field | 2 | color table in tokens |
| Build Queue | GitHub Actions runs (queued/in_progress) + local runner jobs | 3 | duration = live elapsed |
| Deployments count + Recent Deployments | GitHub Releases + local deploy log (runner writes on deploy tasks) | 2/3 | Vercel + App Store Connect APIs = optional Phase 2.5, off by default |
| Active Agents / Running Agents strip / AI Agents roster | runner registry (SQLite): dashboard-dispatched `claude -p` processes | 3 | progress = stream-json events (tool calls, todos); roster = configured agent defs + last status. Terminal-started sessions are NOT live-tracked in v1 — honest limitation |
| AI Tokens Used | parse Claude Code session logs / telemetry usage fields, daily rollup | 4 | display with ≈; delta vs prior week from rollups |
| Activity Feed / Recent Activity | persisted event bus (agent events, CI transitions, deploys, gate changes) | 2–3 | every feed row is a stored event with source id |
| System Status | health checks each 60s: GitHub API, Anthropic API, local server, runner pool | 2 | Operational / Degraded / Down + last-checked time |
| System Monitor CPU/Mem/Network | `systeminformation` on local server, 10s samples, 1h window in SQLite | 2 | sparklines from real samples only |
| System Health % | weighted: health checks + failed builds + runner errors (documented formula in code) | 5 | formula lives next to the value's tooltip |
| Stat deltas (↑2 this week) | SQLite daily snapshots | 2 | no snapshot history yet → hide delta, don't invent |
| AI Command Center / AI Assistant input | Claude API intent parse → server actions | 4 | intents v1: status_query, dispatch_task, create_task (writes TASK.md), run_gate, summarize_activity |
| Quick Actions / quick chips | shortcuts to the same server actions | 4 | |
| Search ⌘K | local index: repos, agents, TASK.md items | 4 | |
| Notifications badge | unread proposal-inbox + failed builds count | 5 | |
| Avatar stacks | agents that touched the repo (from run log) | 3 | replaces fake teammates |
| Sidebar counts | scanner categories | 2 | |
| Templates / Secrets / Billing / Team / Pro Plan | static v1 pages ("not wired yet") | 6 | honest placeholder > fake feature |

## Sync cadence (matches "don't run routines more often than the thing changes")

- GitHub repos/CI: poll 60s while dashboard focused, 10min blurred (webhooks = later upgrade)
- Scanner: on server boot + fs-watch on ops.yml/TASK.md
- Sysmon: 10s · Health checks: 60s · Token rollup: hourly · Snapshots: daily 00:05 · Analyzer: nightly 03:00

## V2 amendments

- Scanner reads `PROJECT_DIRS` (comma-separated list), not a single dir
- GitHub polling uses conditional requests (ETags) — 304 responses don't consume rate limit
- `claude -p` stream-json and session-log parsing go through **versioned adapters**: unknown/changed format → agent renders "running (opaque)" and tokens render "unavailable". Never crash, never guess
- New output channel: **macOS notifications** (node-notifier) for failed build, gate → blocked, new proposal (Phase 4)
- SQLite: WAL mode, drizzle migrations, nightly file backup keeping 7 copies — the run log is the learning system's asset
- All mutating endpoints require `X-ACC-Token` header; SSE is read-only; CORS locked to the web origin

## V3 amendments (Prompt 0.2 council — see docs/COUNCIL.md)

- **Host-header allow-list on ALL routes incl. `/events`** (council S0). CORS is not a DNS-rebinding defense; without a Host check a rebound page can `EventSource('/events')` and exfiltrate the whole portfolio. Accept only `Host ∈ {127.0.0.1:PORT, localhost:PORT}`; carry the token on SSE via same-origin cookie/query.
- **SSE gains event IDs + snapshot-on-connect + `Last-Event-ID` replay** (council S5). One read-only stream with no replay renders pre-sleep values as live after every lid-close. Emit monotonic IDs, push a full snapshot before live deltas on each (re)connect, replay gaps from the events table, show a "reconnecting/stale" indicator.
- **Chart sources defined** (council S3): RadialRing (Active Builds) gets an explicit denominator; add **agent-count** and **health-%** snapshot jobs to the cadence so those two View-B sparklines have a real series. **System Health %** is a documented deterministic formula (health-checks + failed-builds + runner-errors) computed in Phase 2 — **not** the parked analyzer.
- **Scanner watch is scoped** (council S4): watch only `ops.yml`/`TASK.md` with an ignore-list (`node_modules`/`.git`/`dist`), debounce 2–5 s, suppress rescans for a cwd a runner owns, cap depth, skip symlinks — a recursive watch over 20 repos otherwise exhausts file descriptors.
- **Runner backpressure** (council B4): dispatch semaphore (default 3–4) backs the Build Queue; excess dispatches are "queued", not spawned; per-run wall-clock timeout + token budget.
- **Nightly backup is WAL-safe** (council B5): `VACUUM INTO` (not a file copy) + row-count assert before 7-copy rotation.
- **Phase mapping updated** (council D1/D2): the **run logger** lands in Phase 3 (kept); the **AI Tokens / metrics analyzer is parked post-v1** (≥100 runs); pixel-match moves to P3.5; **app-open events** are logged from Phase 2 to feed the P2.5 daily-driver gate.
