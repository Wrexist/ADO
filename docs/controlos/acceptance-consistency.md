# Result acceptance consistency

For versioned runs, the outcome endpoint delegates acceptance to the verifier.
The submitted revision and content digest must match a completed run with passed
verification. The current worktree is then hashed independently. A mismatch or
unreadable worktree clears the old verdict and acceptance rather than leaving a
green result behind. Starting a new verification also clears them before its
preflight checks, including when those checks fail.

## Operation-specific result review

The owner first requests `POST /api/runs/:id/approval` with operation
`result.accept`, the exact revision/digest and the policy version from the run
detail. This prepares a five-minute review; it does not accept the result. The
UI shows that binding and requires a separate **Confirm acceptance** action.
The outcome request must carry its approval ID and the same operation, target
and policy. Missing IDs, another action, changed verification evidence, expired
reviews and consumed/revoked reviews fail closed.

SQLite stores actor `local-owner`, operation, run/repository, revision, content
digest, canonical payload hash, policy version, issue/expiry times and eventual
consumption or revocation. The payload also binds workspace, base revision,
verification evidence ID and prior human outcome. Consumption and the result
decision commit in one database transaction. If either fails, both roll back.
The SQL triggers prohibit changing bindings, rewriting terminal decisions or
deleting history. This transaction covers local database effects only.

Policy snapshots include the acceptance contract and effective project feature
settings. Each policy epoch has an immutable stored snapshot. Project settings
endpoints revoke pending reviews before writing changes, including when a setting
is later changed back. A snapshot observed after restart is compared with the
persisted policy digest. Verification or another human outcome also invalidates
pending reviews. Previously consumed decisions remain historical records, not
reusable permissions under a new policy.

Run detail returns the latest 20 review records and their policy snapshots.
Older records remain in SQLite. Migration 0009 adds the ledger without inventing
decisions for legacy runs. Legacy human judgments keep their previous semantics;
they do not become verified operation approvals.

Verification and acceptance for the same run cannot overlap in one server.
Acceptance uses a conditional database update after hashing: run status,
verification verdict, workspace/base/revision/digest and prior human decision
must still match. A concurrent corrected/redone decision is preserved and the
stale acceptance request is rejected. The regression test uses a real temporary
Git repository and changes the row while content inspection is pending.

The run detail refreshes persisted state after a rejected acceptance or
verification. If that refresh fails, it hides the stale detail and requests a
reload. Browser smoke fixtures exercise both rejection paths and confirm the
old green verdict disappears; these fixtures do not start a provider.

This records a human judgment of an exact result. It does not merge, deploy,
publish, grant process permissions or authorize another operation. It is not a
filesystem lock: a same-user process can still change a worktree after inspection.
`result.accept` and `task.accept` use this ledger; task acceptance additionally
binds the current criteria and their individual decisions. It is not a generic grant for agent
tools, verification commands, dispatch, merge, deploy or publication. Those
operation paths need their own payload and policy contracts before this ledger
can authorize them. The owner identity is still the shared local owner-token
boundary, not a distinct device or multi-user identity. Full T26 remains not_run
until the applicable operation paths are covered; R1–R4 remain open.

Evidence: `approvals.test.ts` covers exact bindings, expiry, policy epochs,
transaction rollback, immutable history and profile reopen. `approvalApi.test.ts`
uses a real temporary Git repository and profile through the HTTP handlers,
including policy toggling, changed content, re-verification and replay rejection.
`approvalMigration.test.ts` upgrades the previous schema with a historical
accepted run. `smoke.mjs` uses explicit API fixtures for separate preparation and
confirmation, keyboard confirmation and desktop/mobile review rendering. No
provider or pilot job is started by these fixtures.

## TestFlight dispatch boundary (2026-09-28)

The TestFlight dispatch endpoint previously projected the version fields from
the request and ignored unrelated fields. It now validates the entire body with
a strict contract: version, build number and an optional nonempty model of at
most 60 characters. Approval IDs, operations, policy versions, result hashes and
other unknown fields are rejected before dispatch or deployment-history writes.
The response asks for a separate TestFlight request and explains that result or
task approvals cannot authorize deployment. Authentication and project dispatch
policy still apply to valid requests.

`approvalApi.test.ts` passes a real, current result approval into this endpoint:
it receives 400, never calls the runner, preserves deployment history and leaves
the approval unconsumed. The same approval then accepts its intended result once;
replay fails. `testflight.test.ts` checks individual foreign fields, malformed
models and array bodies against unchanged run/template API snapshots, plus the
existing valid-dispatch positive control using an offline spawner.

This is request-boundary regression evidence, not an iOS upload, a new deploy
approval workflow, or full T26 acceptance. A separate authenticated dispatch
request retains its existing behavior. No Apple service or live provider was used.
