# Revising and retrying a completed task

`POST /api/planning/tasks/:id/reopen` requires the exact task version, its current
finished run, an explicit reason and an idempotency UUID. It accepts awaiting-review,
accepted or blocked tasks whose current execution binding is terminal. Queued or
running attempts and any retained writer lock for this task refuse the operation.
The host also refuses reopening while verification or result review of any of the
task's attempts is in progress.

Reopening invalidates current task acceptance and pending approvals, appends task
revisions, returns the task to draft and records an immutable `task_reopenings`
audit row in one transaction. An accepted task first receives an invalidation
revision, then a draft revision. The audit records the original and final versions,
reason, old run and local-owner identity. A failed audit write rolls back every
change, including approval revocation. The same key and content returns the same
reopening ID and current task; different content conflicts. A retry after later
editing, another attempt or profile reopening does not repeat the transition.

Previous execution bindings, criterion decisions, run outcomes and working copies
remain. The prior run's human decision is historical, so a run previously accepted
can remain accepted while the revised task is a draft. Its criterion acceptance
is explicitly invalidated. The old run cannot accept the new task revision, and
its verification command cannot be restarted after that binding becomes
historical. Existing evidence remains readable. No original checkout or prior
result is cleaned, overwritten or automatically committed.

Criterion history renders the original criterion text from the immutable execution
definition. Editing or replacing a criterion in the draft cannot relabel an older
decision as evidence for the new criterion.

The web form shows the exact task/version, explains the consequences and requires
a reason. Opening it has no effect. Submission returns a draft to the editor;
the user then reviews and saves the definition as ready and separately reviews a
new run. Lost-response retry retains the exact request/key. The next attempt gets
a new run ID, immutable definition snapshot and separate worktree. It starts from
the explicitly reviewed checkout/base; prior uncommitted work is not copied into
it automatically. Continuing from an earlier artifact needs an explicitly chosen
versioned base, not an implicit merge or cherry-pick.

Evidence: `taskReviewApi.test.ts` exercises accepted task → draft → edited ready
task → new attempt through authenticated handlers with real Git/worktrees and
SQLite. It checks stale/malformed requests, rollback, revoked pending approval,
preserved historical run decision, old-content hashes, immutable reasons, retry
before/after profile reopen, and an npm verification held by explicit fixture signals.
`taskExecutionApi.test.ts` refuses reopening during a live process;
`taskExecution.test.ts` refuses it while an unknown process outcome retains its
writer lock. The criterion browser smoke uses explicit DEMO responses to simulate
a saved reopening with a lost response, identical retry, editing and no automatic
dispatch at desktop/mobile sizes.

The verifier busy guard is host-process state, not durable recovery for auxiliary
commands after a host crash. Full auxiliary-process containment/recovery, sandbox
isolation, carrying reviewed artifacts into a new base, project-specific commands
and all R1–R4 gates remain separate unfinished work. The agent quarantine rules
continue to apply and are not bypassed by reopening.
