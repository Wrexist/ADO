# GitHub unavailable or rate limited (T34)

Inspection found three gaps. A pass with failed per-repo calls reset polling to
60 s, so a partial outage was retried at full rate. A rate limit on one repo did
not stop the pass: every remaining repo still issued its three or four calls.
And the UI had no age for GitHub-sourced data once health turned degraded.

Now:

- `rateLimitWait()` recognises 429, and 403 with `x-ratelimit-remaining: 0` or
  `retry-after`, and derives the wait from `retry-after` or
  `x-ratelimit-reset`, bounded to 1–60 minutes. A 403 without those signals is
  treated as an ordinary failure (e.g. missing permission), not a rate limit.
- The first rate-limited call aborts the pass (`GitHubRateLimited`). No further
  repository or release calls are made, previously published repo data stays
  as it was, health becomes degraded and the next pass waits for GitHub's reset.
- A pass with some failed calls doubles the interval (to 10 minutes max)
  instead of resetting to 60 s. A clean pass returns to 60 s. Passes remain
  serial: concurrent `sync()` calls share one in-flight pass.
- Health keeps `lastOkTs`, the last operational check. System Status shows
  "Data from <age>" under a degraded or down service, so cached GitHub data has
  its own visible age.

Evidence: `apps/server/src/integrations/github/rateLimit.test.ts` (header
parsing and bounds, abort after the first limited call with unchanged repo
state, no calls before the reset under fake timers, degraded health retaining
`lastOkTs`, partial-pass backoff 120 s → 240 s). `scripts/verify.sh` passed
485 tests; `npm run smoke` passed.

Limits: local planning data does not depend on GitHub by construction (it lives
in the local database and the sync never writes it), but this change adds no
dedicated planning-while-offline test. No real GitHub outage or rate limit was
exercised; responses are fixtures. Full T34 acceptance remains open.
