# Task-bound local execution

Migration 0012 adds an immutable link between a run, the exact task definition
revision, its selected checkout and the reviewed base commit. The server derives
the prompt from that stored revision. A client cannot replace it with arbitrary
prompt text. The task must be ready, its project active, its repository assigned,
and every dependency accepted. Existing scanner allow-list and agent switches
still apply. Importing metadata does not change those settings.

`POST /api/planning/tasks/:id/dispatch` requires the current version, checkout ID,
base SHA, provider and a caller-generated idempotency UUID. Repeating the same
accepted request returns the same run; a different payload conflicts. The web
review displays the task version, outcome and selected base, requires explicit
provider selection and a separate start action, and retains the exact payload
and key for retry if the response is lost.

Task/run/outbox changes commit together at queue acceptance, claim and terminal
transition. Claim also acquires the durable writer lock. Task versions increase
at each lifecycle transition and append a revision; the original definition
version in the execution binding never changes. Ordinary task edits are refused
while queued, active or awaiting review. An uncertain failed attempt blocks edits
while its writer lock remains. A failed lifecycle transaction rolls back the task
and run together. Failure to store a terminal result retains the active state and
writer lock; no successful agent event is emitted ahead of the commit.
The failure path also commits the failed build and agent events in that same
transaction. Rejecting either outbox event leaves the run, task and replayed
agent state unchanged until recovery can persist the complete transition.

Before claim, worktree preparation and native process resume, the registered
checkout is checked against the scanner path, directory identity and Git common
directory identity. Preparation refuses a dirty source and a HEAD different from
the reviewed SHA, then creates a separate worktree from that exact commit.
Registered sibling checkouts serialize against the same repository. Existing
lock keys are retained across migration; an old unbound lock also blocks siblings.
If the scope of a legacy lock cannot be established, registered dispatch waits
conservatively instead of assuming it belongs to another repository.
Unregistered sibling worktrees are also compared by their actual Git common
directory identity; separate scanner IDs do not permit concurrent writers.

The default agent scheduler admits two concurrent agent jobs. Queued run API
responses expose a current `waitingReason`, distinguishing repository ownership
(including quarantine) from a full agent execution limit. The history list and
expanded run view refresh those reasons while jobs are pending; reasons clear
when a run leaves the queue. This is a controller limit, not an OS process quota:
verification has separate ownership, and an unknown process can outlive its
controller slot while its repository stays quarantined.

An accepted queued job survives reopening its SQLite profile. It rechecks current
permissions, project/dependencies and checkout/base before spawn. A possibly
started attempt is not restarted: recovery marks it failed/blocked and preserves
quarantine until existing authenticated stop evidence permits lock release.

Successful process exit yields `executionStatus: succeeded` on the run and
`awaiting_review` on the task. It never creates criterion evidence or marks a task
accepted. [Explicit criterion review](task-criteria.md) now records acceptance
against current verification in a separate operation. Failed/cancelled/interrupted attempts currently use the existing failed
run status and blocked task status with diagnostic context; a richer attempt
state model remains open. Existing run-result acceptance does not accept a task.

Completed tasks can be [explicitly reopened](task-revisions.md) for revision and
a separately reviewed new attempt. Reopening preserves previous work and never
starts a process by itself.

## Evidence and limits

`taskExecutionApi.test.ts` exercises authenticated HTTP handlers, a real child
process in a disposable Git worktree, an exact revised task, disabled permissions,
immutable active tasks, exit zero, retry, unchanged original files and profile
reopening. It makes no provider/model call. `taskExecution.test.ts` covers sibling
serialization, queued recovery, outbox rollback, changed base/project/directory,
unknown process outcome, legacy quarantine and terminal storage failure.
`queueAcceptance.test.ts` exercises authenticated dispatch into real temporary
Git worktrees with controlled Node child processes: unregistered sibling
exclusivity, two default agent slots, both waiting reasons, advancement after
exit, and restored completed history without rerunning jobs. The provider is
an offline fixture. `scripts/smoke.mjs` exercises changing queue reasons and
queued/running/done list polling at 1536/390 pixels with explicit DEMO responses.
`scripts/smoke-task-execution.mjs` tests review focus, exact submitted bindings,
keyboard confirmation and awaiting-review rendering at 1536/390 pixels using
explicit DEMO responses. Browser fixtures are not provider execution evidence.

This is trusted local execution, not an OS sandbox. Same-user filesystem races,
shared Git metadata, scanner-ID-based permission migration, default-branch/fetch
selection and versioned context packets remain
separate work. The reviewed base is the imported checkout observation and is
rechecked against actual HEAD; a stale observation requires refresh/reimport.
The operation approval ledger covers `result.accept` and `task.accept`, not task
dispatch. No full R1–R4 gate is certified by this feature.
