# T18 scope decision: the dashboard's own GitHub actions

**Decision (Isac, 2026-09-29):** T18 "Oklart externt utfall" covers only
GitHub operations that ControlOS itself performs. GitHub writes made by agents
through their own tools (`gh`, `git push`, API calls inside a run) are outside
T18.

## Why

ControlOS cannot observe an agent's tool calls reliably enough to journal them;
Claude and Codex run them inside their own processes. Building a journal around
that would mean parsing unstable provider output for side effects, which the
adapter rules forbid (convention 12), and it still could not prove what a tool
did on GitHub.

## What ControlOS does on GitHub today

Only reads. The Octokit adapter lists and gets repositories, pull requests,
check runs, workflow runs, branches and releases; credential verification is a
`GET /user`; project import runs `git clone`. There is no create, update, merge,
comment, dispatch or delete anywhere in the server.

This is now enforced, not just observed: `OctokitClient` registers a request
hook that refuses any method other than GET/HEAD before it leaves the process.
`checks.test.ts` "refuses every GitHub write before it leaves the process"
proves POST, PATCH, PUT (merge) and DELETE are refused with no request sent,
while a normal read still goes out.

Under this scope T18's conditions hold because there is no dashboard GitHub
write whose outcome can be uncertain. Changing the scenario's status is a gate
decision; this document supplies the evidence and leaves `acceptanceStatus`
unchanged.

## Rule for any future dashboard GitHub write

Before the read-only guard may be relaxed for an operation, that operation
needs all of:

1. A stable identity chosen before the request (for example a marker in the
   PR/issue body or a deterministic branch/tag name), stored in a local journal
   in the same transaction as the intent.
2. On timeout or connection loss: record `unknown_outcome`, show it as such in
   the UI, and never retry blindly.
3. Before any retry: look the object up on GitHub by that identity; retry only
   if it is confirmed absent.
4. Tests for timeout-after-success, timeout-before-success and a lost response,
   plus the guard exception scoped to exactly that route.

## Outside this scope, and what the user sees

- **Agent GitHub writes:** not journaled or reconciled. The run-retry
  confirmation already states that anything an earlier attempt did outside its
  working copy (pushes, API calls) is not undone and may happen twice
  (`retry-lineage.md`).
- **Slack/Discord notifications** (not GitHub): each is posted once with a
  5-second timeout, failures are logged, and nothing retries, so a timeout can
  lose a notification but cannot duplicate it.
