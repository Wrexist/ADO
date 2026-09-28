# Credential changes invalidate Anthropic health

The health poller previously returned without emitting when no key existed.
Consequently an earlier persisted `operational` result could remain visible after
removal. An in-flight request could also publish a result for a replaced key or
after the checker had stopped.

`unknown` is now an explicit service-state event. Successful Anthropic credential
save/removal clears prior health immediately, including when the background
checker is disabled. Failed credential writes leave the previous state intact.
Starting the checker invalidates replayed Anthropic health before making its
first request. Missing credentials continue to report unknown on subsequent
ticks. These events have unique identities, so same-millisecond invalidation and
completion cannot be lost through event deduplication.

Each poll has a generation and abort controller. Credential mutations, a newer
poll and stop invalidate older generations. Even if an aborted fetch completes,
its result cannot publish. Re-saving identical bytes also changes the generation,
covering A-to-B-to-A replacement. Completion rechecks the currently resolved key.
Requests refuse redirects and discard response bodies. No new automatic provider
check is started by a credential mutation; the existing periodic poll remains.

The existing status UI renders unknown as **No data**. The aggregate treats it as
missing evidence, rather than a healthy service. A state consisting solely of
unknown checks and no builds has no aggregate score.

`healthCredentials.test.ts` covers replay, aggregate semantics, delayed success
after A-to-B-to-A replacement, late failure after stop, missing key after success,
idempotent start and credential mutation API boundaries. Network responses and
time are explicit fixtures. `probe-health-invalidation.mts` uses synthetic prior
health with a real isolated profile, credential HTTP endpoints, SSE and the built
desktop renderer in both themes. It checks save, reload and removal without
intercepting browser requests. No live credential/provider request is made.

This addresses the Anthropic health lifecycle. It does not certify an actual
expired provider credential, the GitHub sync lifecycle or full T25. Those remain
open, as do the R1–R4 gates.

Validation on Windows/Node 22.18.0: nine focused tests passed; `npm run verify`
passed typecheck, lint, 444 tests in 100 files and build. The HTTP/SSE browser
probe and full `npm run smoke` passed. The probe added after the full lint step
also passed its own ESLint check. Local logs use the prefixes
`controlos-health-credentials-*`, `controlos-health-invalidation-ui.log` and
`controlos-health-probe-lint.log`. Fresh canonical `smoke-shots/command.png` and
`smoke-shots/ops.png` contain DEMO data. Vite's existing chunk-size warning remains.
