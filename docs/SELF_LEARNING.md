# SELF_LEARNING.md — how the system gets smarter on its own

"Learns by itself" means one specific, measurable thing here: **the system mines its own run history nightly, proposes concrete improvements to its skills/manifests/routing, and the improvement is proven by two metrics moving** — 7-day trailing task success rate and median tokens per completed task, both charted on the dashboard. If those lines don't move, it isn't learning, whatever it claims.

## The loop

```
SENSE → every run logged        ANALYZE → nightly job mines it
PROPOSE → concrete diffs        REVIEW → inbox in the dashboard
APPLY → after approval          MEASURE → the two charts judge it
```

### 1. Sense (Phase 3+)
Every dashboard-dispatched run writes a row: repo, task, prompt hash, model, duration, tokens, verify verdict, gate outcome, human action afterwards (accepted / corrected / redone). Human corrections are the highest-value signal — a redo means the system failed even if verify passed.

### 2. Analyze (Phase 5) — nightly 03:00, cheap models
- **Haiku pass**: aggregate stats per repo / task-type / model — success rates, token medians, failure clusters, verify checks that never fail (dead weight) or always fail (broken)
- **Sonnet pass**: read the worst clusters' logs and draft proposals

### 3. Propose — always as concrete diffs, never vibes
- Skill patches: "verify-build missed X twice in dynasty-manager → add check" (diff to SKILL.md or verify.sh)
- Manifest patches: new threshold, new gate criterion, stale convention (diff to ops.yml)
- Prompt patches: recurring correction folded into the repo's reasoning skill
- Routing updates: "Sonnet matches Opus on task-type Y at 40% tokens → route Y to Sonnet" (diff to the routing table)
- Schedule tuning: "routine Z produced nothing useful in 6 runs → propose kill"

### 4. Review — the inbox
Proposals land in a dashboard inbox (the notification badge): diff, evidence (linked runs), expected effect. One tap: apply (commits to the target repo) / reject (logged — repeated rejected patterns teach the analyzer what not to propose) / snooze. **v1 applies nothing without you.** After ~30 days, if a proposal class runs >80% accepted, it can graduate to auto-apply (only low-risk classes: verify-script additions, log formats, schedule intervals — never conventions, never gate criteria).

### 5. Compounding rituals (scheduled, cloud)
- **Nightly**: analyzer (above)
- **Weekly Friday**: sweeper (already in wrexist-ops) + a 10-line self-report: what was learned, what was proposed, what you rejected, metric trend
- **Monthly**: reasoning-skill regeneration — the strongest available model rewrites each repo's reasoning SKILL.md from that month's LEARNINGS.md + accepted proposals (the July-7 Fable extraction, made a habit so the skills never fossilize)

## Guardrails (non-negotiable)
- Learning applies to **verifiable work only**. Copy, strategy, and content decisions are excluded from auto-anything (the no-slop rule)
- The analyzer reads logs; it never gets write access to repos — only the apply action (after your approval) commits, and each apply is one revertable commit
- Metrics are computed from stored runs by a deterministic script, not by a model summarizing — the proof of learning must itself obey the no-fabrication rule

## V2 amendments

- **Volume floor**: the analyzer phase doesn't start until ≥25 runs are logged (gate p5 precondition). Below that, proposals would be confident noise — the exact slop this system exists to prevent
- **Catch-up scheduling**: analyzer/rollups/snapshots store last-run and fire on server boot when overdue (>20h). A laptop that sleeps at 03:00 no longer silently disables learning; the Friday self-report includes "runs missed & caught up"
- **Injection invariant**: the analyzer treats all logged content — agent output, README text, App Store reviews, web quotes — strictly as data. Instructions found inside data are reported as anomalies, never followed. Combined with approval-required diffs, this is the defense line
- **Kill-switch honesty**: the run log also measures the dashboard itself (opens per day post-Phase-3). If the kill criterion trips, the correct "learning" is to stop building — write that outcome to TASK.md like any other blocked gate
