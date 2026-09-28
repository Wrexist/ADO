# GitHub connection replacement and stopped syncs

GitHub sync previously checked its stop flag only before a polling tick. Pending
repo, CI or release requests could still publish observations, build events and
green health after a credential replacement or shutdown. Removing the final key
also left the last persisted health check visible.

Connection startup/replacement now clears GitHub health to `unknown`, before
deciding whether a client is available. A stopped instance refuses new syncs and
checks its lifetime after each asynchronous provider boundary. Late successes
cannot reach repository observations, CI/build publication, releases or health;
late polling failures cannot publish degraded health, log or schedule another
tick. Already published historical data is retained. In-flight network requests
may finish; this change suppresses their effects rather than claiming transport
cancellation.

Calls on one live instance share its pending sync promise, and repeated `start`
calls cannot create duplicate polling loops. A stopped instance is terminal;
credential replacement uses a new instance. Health events use unique IDs so two
different same-millisecond outcomes do not collapse under event deduplication.

`integrations/github/lifecycle.test.ts` uses real SQLite/Bus and controlled
provider promises at the repo-list, enrichment and release boundaries. Each case
captures the exact state after stop and proves no subsequent publication, then
replays the database. Other cases cover single-flight polling, late errors and
the authenticated credential API. Replacing a key clears old green health;
resolving the old client's repo list has no effect, while the current client can
complete normally. Removing the final credential clears health without a client.

These are local lifecycle tests with an explicit provider fixture. They do not
prove a real expired/revoked GitHub credential or unknown-outcome reconciliation
for remote writes. T25, T18 and the full R1–R4 gates remain open.

Validation on Windows/Node 22.18.0: the initial focused run passed 13 tests in
two files. The final full `npm run verify`, including the added last-credential
removal case, passed typecheck, lint, 451 tests in 101 files and build. Logs:
`controlos-github-lifecycle-focused.log` and `controlos-github-lifecycle-verify.log`.
No UI markup changed; the existing Vite chunk-size warning remains.
