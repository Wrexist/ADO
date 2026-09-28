# Configuration and credential verification

Connection status now reports `configured` separately from `authentication`,
`checkedTs` and a bounded, server-authored verification message. The previous
ambiguous `connected` field is removed. Saving a key never authenticates it.
Credential hints remain masked; no provider response body, token or fingerprint
is returned to the client.

The authenticated `POST /api/connections/:id/verify` action currently supports
GitHub using read-only `GET https://api.github.com/user`. Redirects are refused
and the request has a ten-second deadline. HTTP 200 means the credential was
accepted at that endpoint, not that every repository permission is available.
HTTP 401 is rejected; other responses and network failures are inconclusive.
Other connectors explicitly return unsupported and send no provider request.
There is no model request or paid-provider fallback.

Results are tied to the exact credential and latest request generation in memory.
A key change, removal, changed environment fallback or restart invalidates them.
Checks expire at five minutes, using both wall time and monotonic elapsed time.
Backward movement in either observed clock, or an invalid clock reading, makes
the check stale. Once observed stale, it cannot revive when the clock moves back
into range: a new provider check is required. Invalid timestamps at completion
cannot create a verified record. These checks remain in memory, so a restart
still requires fresh verification. Settings refreshes local status every
15 seconds and on focus; this does not recheck the provider. The UI distinguishes
configuration from verification and displays the check timestamp and limitation.

Setup uses the same distinction. A stored credential produces `configured`, never
`installed` or Ready. Only a currently verified credential produces `verified`,
with the explicit limit that repository permissions were not checked. Rejected,
expired, inconclusive and unsupported checks keep a non-ready status and explain
the next action. Every Setup response recomputes connection status from the store;
cached machine probes cannot preserve an expired green credential result. The
page refreshes local status every 15 seconds and on focus without provider calls.
Restart clears authentication while retaining configuration. Setup's access-key
instructions now use server configuration and runtime pairing, not a web-build key.

Local evidence: `connections/verification.test.ts` injects HTTP responses for
expired/rejected, forbidden, accepted and unsupported checks, advances the clock,
reopens storage and races credential replacement against a late response.
`setup/connectionStatus.test.ts` exercises authenticated Setup and Verify API
handlers with stored fixture credentials and injected 401/200 provider responses,
then reopens the server and confirms that only configuration remains. Setup reads
themselves send no provider request. Probe tests cover every authentication state.
`scripts/smoke.mjs` renders an explicitly labeled rejection fixture and exercises
the Verify action at 1536/390 pixels. No real GitHub credential was checked.
It also shows Setup moving from rejected to verified to expired through focus
refreshes, with no Ready label for the expired credential.
Full T25 remains not_run pending actual expired-credential acceptance; fixture
success does not establish a live provider account or all connector support.

The clock regression holds wall time still while monotonic time reaches the
exact deadline, moves both clocks backwards, checks that stale state never
revives, verifies explicit renewal and rejects an invalid completion timestamp.
This is deterministic local freshness evidence, not an actual expired credential.

The endpoint and response interpretation follow
[GitHub's authenticated-user API](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).
