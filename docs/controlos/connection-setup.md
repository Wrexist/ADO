# Connecting services (GitHub, Claude, Slack, Discord)

Goal: paste a key once and get a clear answer, without extra clicks.

## What changed

- **Save is followed by a check.** For services with a read-only check
  (GitHub, Claude), Save/Connect stores the key and then checks it immediately.
  Opening Settings also re-checks, once per visit, any saved key whose check is
  missing or older than five minutes. The five-minute freshness rule itself is
  unchanged; only a fresh provider answer marks a key as connected.
- **GitHub reports who and what.** The check returns the login and, for
  classic tokens, the scopes: `repo` (public and private repositories),
  `public_repo` only, or no repo scope (repositories, PRs and CI will be
  missing). Fine-grained tokens report no scopes, so their repository access is
  stated as not checked.
- **Claude keys are checked** with `GET /v1/models?limit=1`: 200 verified, 401
  rejected, anything else inconclusive. Slack and Discord webhooks are not
  tested, because a test would post a message; the card says so.
- **Distinct states:** Connected (green), Key rejected (red, "Create a new
  key" link), Couldn't check (amber), Needs a fresh check, Saved · not checked
  yet, and Saved for services without a check.
- **Key link with fewer permissions:** the GitHub quick link now asks only for
  `repo` (the unused `workflow` write scope is gone). A second link creates a
  read-only fine-grained token.
- **Format hint:** a non-blocking warning appears when a pasted value doesn't
  look like the service's key (`ghp_`/`github_pat_`, `sk-ant-`, Slack/Discord
  webhook URLs).
- **Readable errors:** lost browser access, empty values, unknown services,
  non-JSON server errors and an unreachable server each have a plain sentence.
  Connector ids are URL-encoded on every call.
- **Setup and System Status point to Settings.** Setup shows the provider's
  message (login, scopes or rejection reason). GitHub/Anthropic rows in System
  Status link to Settings when not operational. The count now reads "N of 4
  live integrations connected" and counts only verified live connectors.

## Evidence

`apps/server/src/connections/verification.test.ts` (scopes, login sanitising,
fine-grained tokens, Claude verified/rejected/inconclusive, webhooks not
contacted, secrets never in status), `apps/web/src/lib/connections.test.ts`
(format hints, error sentences), Setup tests, and the `npm run smoke` Settings
flow: automatic check on open, "Key rejected" with the provider message and
new-key link, "Check again", format warning, replace/disconnect errors at
1536/390 px (`smoke-shots/credential-rejected-*.png`,
`connection-recovery-*.png`). The smoke uses mocked connection responses; no
real GitHub or Anthropic request was made during this work.

Limits: fine-grained token permissions and GitHub App tokens are not
inspected. Slack/Discord delivery is not tested. Keys set in `.env` are checked
the same way but can only be replaced there or overridden in Settings.
