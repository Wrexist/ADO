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
