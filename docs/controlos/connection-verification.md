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
Checks older than five minutes are stale. Settings refreshes local status every
15 seconds and on focus; this does not recheck the provider. The UI distinguishes
configuration from verification and displays the check timestamp and limitation.

Local evidence: `connections/verification.test.ts` injects HTTP responses for
expired/rejected, forbidden, accepted and unsupported checks, advances the clock,
reopens storage and races credential replacement against a late response.
`scripts/smoke.mjs` renders an explicitly labeled rejection fixture and exercises
the Verify action at 1536/390 pixels. No real GitHub credential was checked.
Full T25 remains not_run pending actual expired-credential acceptance; fixture
success does not establish a live provider account or all connector support.

The endpoint and response interpretation follow
[GitHub's authenticated-user API](https://docs.github.com/en/rest/users/users#get-the-authenticated-user).
