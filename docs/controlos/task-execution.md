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

Before claim, workspace preparation and native process resume, the registered
checkout is checked against the scanner path, directory identity and Git common
directory identity. Preparation refuses a HEAD different from the reviewed SHA.
New results use an independent Git repository populated from that exact commit
through Git object transport. No worktree registration, shared refs, object
hardlinks, alternates, source hooks or source remote configuration are installed.
Only the effective commit author name/email are copied into local configuration.
Initialization and checkout disable global/system configuration and template hooks.
Source commands disable optional index refreshes and ignore inherited `GIT_*`
overrides. A changed source HEAD during preparation is refused.

Task review explicitly states that uncommitted source changes are excluded and
preserved. A task-bound reviewed commit can therefore be used while the original
has staged, unstaged or untracked changes. Ordinary prompt dispatch without a
reviewed base still refuses dirty sources. No stash, reset or clean is performed.
Migration 0017 captures the original physical Git identity at claim and makes it
immutable once stored. Both source and result identities participate in writer
exclusion, so independent result metadata does not permit sibling source writers.
Legacy runs retain their existing worktrees and null source identity; they are
not silently moved or reconstructed, and existing conservative lock checks remain.
Registered sibling checkouts serialize against the same repository. Existing
lock keys are retained across migration; an old unbound lock also blocks siblings.
If the scope of a legacy lock cannot be established, registered dispatch waits
conservatively instead of assuming it belongs to another repository.
Unregistered sibling worktrees are also compared by their actual Git common
directory identity; separate scanner IDs do not permit concurrent writers.

The profile admits at most two owned writer jobs across agents and verification.
Every retained execution lock counts, including unknown outcomes, interrupted
owners and ownership from another server connection. Migration 0016 enforces
admission in SQLite as well as before scheduler claim. Old profiles with more
than two locks keep them all and admit no new writer until fewer than two remain.
An agent controller can additionally impose a lower local concurrency limit.

Queued run API responses expose a current `waitingReason`, distinguishing
repository ownership, occupied profile capacity and a lower local controller
limit. The history list and expanded run view refresh reasons while jobs are
pending; reasons clear when a run leaves the queue. This bounds admitted writer
jobs in one profile, not individual descendant processes, other profiles or
unmanaged external programs. Uncertain outcomes retain their place until the
existing recovery path confirms stop. Capacity exhaustion never unlocks a repo.

An accepted queued job survives reopening its SQLite profile. It rechecks current
permissions, project/dependencies and checkout/base before spawn. A possibly
started attempt is not restarted: recovery marks it failed/blocked and preserves
quarantine until existing authenticated stop evidence permits lock release.
Repeated recovery on the same controller skips its currently active jobs; they
are not orphaned. Recovery still treats unknown previous owners conservatively.

The ordinary dispatch HTTP endpoint accepts an `idempotency-key` header. Its
stored request hash binds repository, task, model and provider. Identical retries
return the original run ID, including after completion, failure, a policy change
or restart. Changed content returns HTTP 409. Returning a prior ID never starts
that run again; a new key is still subject to the current dispatch policy.

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
process in a disposable Git repository, an exact revised task, disabled permissions,
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
`executionCapacity.test.ts` checks an over-capacity profile migration and two
independent OS processes racing for the last slot, including transaction rollback.
`spawnFailure.test.ts` keeps two actual lost child processes alive while proving
that a third writer waits through reopening. `verificationOwnership.test.ts`
checks mixed verifier/agent ownership and that capacity refusal preserves prior
result decisions without creating a verification attempt.
`dispatchAcceptance.test.ts` covers T15/T17/T19 through API handlers and real
offline Node workers. T15 uses a separate listening HTTP server, injects a failure
at claim-event persistence, receives a successful dispatch response, confirms the
queue row, and abruptly terminates that server through its owned process handle.
After removing the injected fault, a new server scans only the temporary profile,
claims the same row under one new owner and starts one worker. Repeated recovery
and a further profile reopening do not duplicate the worker. This proves process
crash recovery, not physical power-loss durability or every crash window.

The retry/policy scenario sends simultaneous identical requests, checks conflicts
for changed task/model/provider, disables dispatch while a second job waits, and
then allows the first process to exit. The waiting job fails without spawning.
After reopening, retries return the two original IDs and a fresh request remains
forbidden. No provider/model call is made. Test-only `startScanner` injection
permits an explicit temporary-profile scan while system/external integrations
remain disabled; the normal startup default is unchanged.

`taskExecution.test.ts` also exercises T13: a reviewed task with dirty staged and
unstaged source files, an untracked binary, a chosen branch and custom hooks/config
starts a real process in independent Git metadata and is cancelled. Recursive
content/mode snapshots of the entire source including `.git` match before,
during and after the job. The result keeps the agent edit and has no source
hook, remote path or object alternates. This is a preservation test for managed
preparation/cancellation; a trusted same-user agent can still address other files.

Migration 0018 records `workspaceKind: isolated_clone` and the physical Git
identity returned by preparation. Once recorded, the kind, identity, path, base
revision and branch cannot be changed or cleared. The database rejects incomplete
provenance and an isolated clone with the source's Git identity. Historical rows
keep null provenance; the UI displays "not recorded" instead of inferring a type.
The public API exposes the kind, not the private filesystem identity.

Execution preflight, result hashing, verification and acceptance check the recorded
identity. A replacement repository with identical commit and content is refused;
previous verification and acceptance are invalidated. The identity is checked
before and after hashing, but does not lock the filesystem against same-user
races. `workspaceProvenance.test.ts` exercises immutable metadata and actual
repository replacement; API and browser tests cover persistence and both recorded
and historical display states.

This is trusted local execution, not an OS sandbox. Same-user filesystem races,
legacy shared worktrees, scanner-ID-based permission migration, default-branch/fetch
selection and versioned context packets remain
separate work. The reviewed base is the imported checkout observation and is
rechecked against actual HEAD; a stale observation requires refresh/reimport.
The operation approval ledger covers `result.accept` and `task.accept`, not task
dispatch. No full R1–R4 gate is certified by this feature.
