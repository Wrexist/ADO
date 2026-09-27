# Criterion acceptance of a task result

Task acceptance is an explicit local-owner decision, separate from process exit
and from acceptance of a run's result. It requires a successful task-bound run,
the exact current awaiting-review task version, and independent verification of
the run's current commit and content hash. No writer lock for the run may remain.
Every criterion from the immutable dispatched definition must appear exactly
once. Required criteria need a pass decision; optional criteria may fail or remain
unchecked. Every decision needs a written explanation of its evidence. These are
human judgments, not automatically inferred criterion test results.

The review UI exposes the recorded verification command, exit code, timestamp,
evidence ID and redacted output, along with the result commit and content hash.
Preparing a review records no task acceptance. A second confirmation consumes a
five-minute, one-time `task.accept` approval. Its immutable payload includes the
task lifecycle version, original definition version, exact criterion decisions,
run, checkout result, verification record, prior run decision and policy version.
Changing the notes, evidence ID, task, content or policy requires a new review.
The `result.accept` endpoint cannot consume a `task.accept` approval.

Migration 0013 records the accepted criterion decisions in `task_reviews`.
Approval consumption, run decision, task status/version, execution lifecycle
version and append-only task revision commit in one SQLite transaction. Failed
storage leaves no partial acceptance or consumed approval. Review bindings cannot
be edited or deleted; a single recorded invalidation preserves their history.
Ordinary task editing still cannot set accepted status.

New verification or a corrected/redone run decision invalidates task acceptance
in the same transaction and returns the task to awaiting review. Discovery of
changed or unreadable result files also invalidates it. The accepted-task card
describes a recorded decision and offers a current-content recheck; it does not
claim continuous filesystem monitoring. Dependent task starts and new task
acceptance recheck accepted dependency results, including transitive dependencies.
A stale dependency blocks the new process before spawn and retains the original
decision as invalidated history. Native resume also checks current task/dependency
states through the existing dispatch gate. Filesystem checks are observations,
not an OS sandbox or a transaction against another same-user writer.

`taskReviewApi.test.ts` uses authenticated handlers, temporary Git repositories,
real `npm run verify` child processes and SQLite reopening. It checks omitted,
duplicate and failed required criteria; missing notes; swapped verification IDs;
changed notes; cross-operation tokens; transaction rollback; retry; correction;
reverification; immutable history; and dependency content changed before start.
T06 explicitly verifies commit A, changes the result to committed B and requests
task acceptance. Acceptance is refused and verification is invalidated. A second
case changes binary content in an untracked filename beginning with a space.
The original source checkout is preserved. Providers are offline fixtures.

`scripts/smoke-task-review.mjs` uses explicitly labeled DEMO API responses to check
desktop/mobile evidence inspection, per-criterion decisions, separate keyboard
confirmation, stale rejection, recheck and history. It is UI evidence, not proof
of actual provider execution. Actual API/Git/SQLite behavior is covered separately.

Current verification still requires `npm run verify`. Project-specific commands,
an explicit revise/retry workflow for an awaiting-review task, criterion evidence
attachments, device-specific owner identity, live provider acceptance, deployment
operations and complete R1–R4 acceptance remain open. No failed criterion is
silently waived, and this feature performs no merge, deployment or publication.
