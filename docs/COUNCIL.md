# COUNCIL.md — Prompt 0.2 plan council (pre–Phase 1)

Three adversarial reviewers attacked the **final** plan (MASTER_PLAN + DESIGN_SPEC + DATA_MAP + SELF_LEARNING + ROADMAP + ops.yml), *after* the v2 audit amendments in [`AUDIT.md`](../AUDIT.md) were already folded in. Their brief was to find what those amendments **missed or inadequately closed** — not to re-litigate settled items.

Severity: **BLOCKING** = would cause real failure / an unachievable gate · **SHOULD-FIX** · **NOTE**.

Status: findings recorded. **Amendments below are PROPOSED and awaiting Isac's approval before Phase 1** (per Prompt 0.2). Nothing in the locked plan is changed until the decisions in §4 are made.

---

## 1. Convergence — where reviewers independently agreed (highest signal)

Four roots were hit by **two or more** reviewers coming from different directions:

- **C1 · The `p1` "1:1" gate is simultaneously unachievable and mis-prioritized.**
  Frontend: the reference numbers *disagree across the two views and view-b contradicts itself*, so numeric equality is impossible (FE1); and only the happy path is drawn, yet inventing the missing states is forbidden (FE4). Solo-dev: pixel-perfect-first **back-loads all real value** behind the most time-consuming polish (SD3) and makes View B's **decorative** widgets mandatory (SD4). → The gate as written can't be passed honestly *and* sequences the least-useful work first.

- **C2 · A static-pixel regime collides with dynamic, real content.**
  The visual-diff baseline can never stay green against live timestamps/samples/counts (FE2); live elapsed timers reflow rows every second (FE3); honest degraded strings overflow number-sized slots (FE5). → "No layout shift" + "screenshot baselines" were specified against mock, never re-checked against real data.

- **C3 · The self-learning loop is the riskiest bet, and its stop-guard isn't real.**
  Solo-dev: Phase 5 is peak complexity for the least-certain, most-delayed payoff, and the ≥25-run floor is months away and too thin to cluster (SD2); the kill/anti-pivot clauses are prose self-judged against sunk cost, enforced by nothing in `ops.yml` (SD1). Infra: the analyzer's auto-apply of executable verify-scripts reopens the injection hole (IS6). → The headline feature is where the plan is least validated *and* least protected against over-investment.

- **C4 · The agent execution layer has no backpressure or isolation.**
  No concurrency/resource ceiling on the runner → OOM at ~10 agents each running a full build (IS1); the scanner fs-watches the exact trees the runner writes into, and a recursive watch over 20 repos exhausts file descriptors (IS3). → "10 concurrent agents" was a target with no mechanism behind it.

---

## 2. Consolidated blockers → proposed amendments

| # | Blocker (source) | Proposed amendment |
|---|---|---|
| **B1** | **1:1 gate demands numeric equality the references can't satisfy** (FE1; theme C1). view-a shows 12/8/24, view-b 23/12/15, and view-b's own header ("12 projects active") contradicts its Repositories stat (23). | Amend gate `p1` + DESIGN_SPEC: reference **numbers are illustrative and per-view**; judge the match on **layout, spacing, color, and component presence — not digits**. Give Prompt 0.3 **per-view mock overrides**. Define the real "total repositories" vs "active projects" relationship so both cards have an honest source. |
| **B2** | **Visual-diff baseline is non-reproducible against live data** (FE2; theme C2). Relative times, 10s sparkline samples, and real counts make every frame differ → diff goes permanently red → gets muted; S10's guard protects nothing. | Amend Prompt 6.1 + DESIGN_SPEC: baseline against a **frozen deterministic `--demo` seed** (fixed clock, fixed sample arrays, fixed numbers) in a dedicated snapshot mode covering `/kit` + both views, with known-dynamic regions **masked** — never against the live app. |
| **B3** | **Live elapsed timers reflow rows every second** (FE3; theme C2). "45s"→"1m 05s" grows 3→5 chars; tabular-nums equalizes digit advance, not string length → the most frequent possible layout shift, violating the plan's own rule. | Amend the Prompt 1.5 quality floor: **all live/elapsed values render in reserved fixed-width masked slots** (min-width `00m 00s`, left-padded); cap status-chip widths. Add "live timers use a reserved-width mask" to the checklist. |
| **B4** | **Runner has a turn cap but no concurrency or resource ceiling** (IS1; theme C4). ~10 headless agents each running `verify.sh` (typecheck+lint+test+**build**) → RAM/CPU exhaustion, OOM, UI freeze; nothing queues the 4th–11th dispatch; a stuck agent pins a slot forever. | Amend Prompt 3.1: add a **dispatch semaphore** (default max 3–4, configurable) that **backs the Build Queue** — excess dispatches show "queued", not spawned; add a **per-run wall-clock timeout + token budget** that kills+marks-failed on breach; spawn at reduced OS priority. |
| **B5** | **"Nightly db-file copy" of a WAL database captures a torn/stale file** (IS2). Committed rows live in `-wal` until checkpoint; a plain `cp` at 00:05 during writes misses the newest rows or won't open — and the run log *is* the learning asset. | Amend Prompt 6.1: replace the file copy with a **WAL-safe path** — `VACUUM INTO 'backup.db'` (or the online-backup API / `sqlite3 .backup`); after writing, **open the copy and assert a row count** before rotating out copy #8. |
| **B6** | **Kill/anti-pivot clauses are prose, not gates — self-judged against sunk cost** (SD1; theme C3). The only machine check is `attempts:5` (counts tries, not calendar weeks); "opened daily" is measured by the dashboard and judged by its author a week later — the textbook setup for rationalizing past it. | Amend `ops.yml`: add a real **`p2.5-daily-driver` gate** that reads **distinct open-days from the run log** and refuses Phase 3 until opens ≥5 of the trailing 7 days; put a **hard calendar date** (not an attempt count) on the "blocked > 1 week → halt" rule. Moves the usefulness verdict *before* the two most expensive phases. |

---

## 3. Should-fix & notes

**Highest-priority should-fix (security — recommend treating as blocking):**

- **S0 · SSE is an unauthenticated exfiltration channel; CORS is not a DNS-rebinding defense** (IS5). Rebinding makes the attacker page same-origin with `127.0.0.1`, so CORS/Origin no longer applies; `/events` is deliberately token-free, so a rebound page opens `EventSource('/events')` and streams the whole portfolio, activity, token spend and agent I/O to an attacker. AUDIT B3's "closed by CORS + token" claim does not actually mitigate the named lens. → **Amend Prompt 2.1/CLAUDE.md:** global **Host-header allow-list** (accept only `Host ∈ {127.0.0.1:PORT, localhost:PORT}`) applied to **every** route including `/events`; carry the token on SSE connect via same-origin cookie or query param.

**Should-fix:**

- **S1 · Failure/idle/empty states are undesigned yet forbidden to invent** (FE4; C1). Extend the `/kit` demo route to render every component in its failure/idle/empty/degraded state; sign those off as canonical at p1; enumerate them in DESIGN_SPEC (failed-build bar, idle StatusDot, no-CI card, versionless "Live", empty FeedRow).
- **S2 · Degraded strings overflow number-sized slots** (FE5; C2). Represent "tokens unavailable"/"running (opaque)" as **fixed-footprint tokens** (`≈—` with reason in a tooltip; a muted indeterminate bar), not prose; reserve a min digit-width for stat values.
- **S3 · RadialRing + two View-B sparklines have no numeric basis** (FE6). "8 active builds" has no denominator; nothing samples agent-count or health-% over time. Give the ring an explicit denominator (active/total) or drop it for a number; add agent-count + health-% snapshot jobs to the DATA_MAP cadence, or spec the flat "collecting data" line as the intended look.
- **S4 · Scanner watches the trees the runner writes into; recursive watch over 20 repos exhausts FDs** (IS3; C4). Watch only `ops.yml`/`TASK.md` with an ignore-list (`node_modules`/`.git`/`dist`); debounce rescans 2–5 s; suppress rescans for a cwd while a runner owns it; cap walk depth; skip symlinks.
- **S5 · SSE has no snapshot-on-connect or `Last-Event-ID` replay → stale state rendered as live after every laptop sleep** (IS4; C2/C3). Emit monotonic event IDs; push a **full snapshot on every (re)connect** before live deltas; honor `Last-Event-ID` by replaying from the events table; show a "reconnecting/stale" indicator until the snapshot lands.
- **S6 · Auto-apply of "verify-script additions" reopens injection on executable code** (IS6; C3). **Bar any proposal class that emits executable content** (verify scripts, `ops.yml`, shell) from auto-apply — keep permanently human-gated; restrict graduation to inert formats (log schemas, schedule intervals). If kept, route via a PR + a second-model injection screen, never a direct commit.
- **S7 · Phase 5 is peak complexity for the least-certain, most-delayed payoff** (SD2; C3). Defer the analyzer out of v1; keep only the cheap durable asset — the Phase 3 run logger — and gate the analyzer as a post-v1 milestone on real volume (≥100 runs).
- **S8 · Value is back-loaded; the ~3-week estimate reads 3–4× optimistic as calendar time** (SD3; C1). Phase estimates sum to ~16–20 *working* days; first real value (Daily-Driver) lands behind the pixel polish. Consider a functional-shell-then-pixel-match order to reach daily value in week 1–2; restate the headline as "~16–20 working days, first real value ~week 2".
- **S9 · View B is multi-user agency decoration made mandatory by the 1:1 gate** (SD4; C1). Cut **System Health %** (an invented composite that duplicates the 4 honest System Status rows) and the "not-wired-yet" half of Quick Actions; simplify radial→number, avatar-stack→single agent chip, System Monitor→drop or one slim strip; loosen `p1` to "1:1 on load-bearing components, honest simplification of decorative ones"; make the descope lever a scope **cut**, not a slip.

**Note:**

- **N1 · The 5-intent NL command box rebuilds a weaker version of the terminal Isac is already in** (SD5). Ship dispatch + status as two quick-action buttons (keeping the run logger behind them); defer intent parsing until there's evidence the dashboard is the preferred dispatch surface.

---

## 4. Decisions required before Phase 1

The engineering amendments **B2–B5, S0, S2, S4, S5, S6** are low-controversy hardening — recommend folding all in. The remaining items are genuine product forks for Isac:

- **D1 · Sequencing & the `p1` gate** (B1, B6, S1, S8, S9): keep pixel-first with a *fixed, judgeable* gate, or reorder to value-first (functional shell → real data → pixel-match)?
- **D2 · Phase 5 self-learning** (S7): keep in v1 with the safety fixes, or defer post-v1 and keep only the run logger?
- **D3 · View B scope** (S9, N1): build full 1:1, or cut/simplify the decorative widgets and loosen the gate?

Once decided, the chosen amendments are folded into MASTER_PLAN / DESIGN_SPEC / DATA_MAP / ops.yml, and `/gate p0-foundation` can close.

---

## Appendix — raw reviewer tables

<details><summary>A. Frontend engineer</summary>

See findings FE1–FE6 above (B1, B2, B3, S1, S2, S3). Lens: 1:1 recreation + live-update model. 3 blocking, 3 should-fix.
</details>

<details><summary>B. Infra & security engineer</summary>

See findings IS1–IS6 above (B4, B5, S0, S4, S5, S6). Lens: scanner/runner/SQLite/SSE/GitHub at ~20 repos / ~10 agents + security. 2 blocking, 4 should-fix.
</details>

<details><summary>C. Skeptical solo-dev advisor</summary>

See findings SD1–SD5 above (B6, S7, S8, S9, N1). Lens: ROI per feature for one solo user + enforceability of the stop mechanism. 1 blocking, 3 should-fix, 1 note.
</details>
