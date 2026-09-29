# Hostile web origin (T27)

Inspection found no route that exposes sensitive data or accepts a mutation
from a hostile origin: a global `onRequest` hook checks Host (DNS rebinding)
and Origin on every route, a global `preHandler` requires `X-ACC-Token` on
every non-GET request, each sensitive GET checks the key, and Fastify's
`trustProxy` is off, so forwarding headers are never read. Existing tests
combined forged proxy headers with a hostile Origin, so the Origin check alone
explained the refusal; Host, credential and proxy trust had no isolated tests.

Change: `/events` no longer accepts the key as `?token=`. The web client
already sends the header; a key in a URL leaks into logs, history and
referrers.

`apps/server/src/securityBoundaries.test.ts` now tests each dimension alone,
in serve-web mode, across a JSON read, a mutation, the event stream, the static
page and asset, and `/health`:

- Host: valid key, no Origin, forged forwarding headers, and a foreign,
  look-alike or missing Host → 403 everywhere.
- Origin: hostile Origin with a valid key on static files, health, preflight,
  POST/PUT/DELETE → 403, and the prompt list is unchanged.
- Credential: no key, a wrong key or a rotated key → 401 on reads, mutations,
  connections and the event stream (never an event-stream body); `?token=`
  with the real key → 401.
- Proxy: forged `X-Forwarded-*`/`Forwarded` without a key → 401; with a key
  they do not change the response; `trustProxy` is off.

`scripts/verify.sh`: 497 tests passed.

Limits: the server has no revocable sessions. Revoking browser access means
rotating `ACC_TOKEN` and restarting; the rotated-key case above covers that
path. Phone pairing and per-device revocation belong to T29. Full T27
acceptance remains open.
