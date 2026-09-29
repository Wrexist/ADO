# Stale context is marked for re-check (T11)

Context packages already stored the base commit, file blob ids and hashes,
approval re-read the sources at that base, and dispatch failed closed if the
working copy had moved. But nothing marked a package for re-check: the package
list showed an old-base package simply as `approved_for_context`, and a moved
working copy was only discovered after the run was queued, when workspace
preparation failed and the task was left `blocked`.

Now:

- The package list reports `recheck` per package: `current` (task version and
  the checkout's recorded commit match the package), `base_moved`,
  `task_changed` or `checkout_unknown`. The earlier decision is kept as
  history. The Tasks view shows "Re-check required: …; the earlier decision is
  history, not a current check; create a new package."
- `dispatchTask` reads the checkout's live `HEAD` before queueing. If it no
  longer equals the reviewed base (or cannot be read), the request is refused
  with both commits; no run or task execution is created and the task keeps
  its status.

Evidence: `contextDispatch.test.ts` (checkout_unknown → current → base_moved
while the decision stays `approved_for_context`; a real Git checkout moved by
one commit refuses dispatch with no run or execution row). `scripts/verify.sh`
501 tests and `npm run smoke` passed.

Limits: `recheck` uses the commit recorded at the last registry observation,
not a live read; the live read happens at dispatch. Instruction files
(`CLAUDE.md`, `AGENTS.md`) inside the target repository are still loaded by
the provider without hashing or review. Full T11 remains open.
