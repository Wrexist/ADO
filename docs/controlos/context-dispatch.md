# Exact reference-package binding at task execution

Task dispatch accepts an optional `contextPackage` containing its `id`, `digest` and approved `reviewVersion`. Migration `0023_execution_context` persists these fields in the immutable task execution binding. All three fields must be present together. Existing executions migrate with null context fields; no historical package selection or approval is invented.

The package must match the original task revision/hash, project, repository, checkout and base commit. Its latest review must still be `approved_for_context` at the selected version. Validation repeats at queue acceptance, queue claim, workspace preparation, prompt construction and native process identity registration. Package corruption, changed/revoked review, newly configured secrets or a mismatched target refuse execution. The existing source identity and exact-HEAD workspace checks remain in force.

The provider receives the owner task followed by the exact selected source files as explicitly labelled untrusted JSON reference data with blob IDs and digests. The combined serialized message is limited to 65,536 UTF-8 bytes without truncation. This is an application byte limit, not verified accounting for a provider's full token window or automatic file context. The package's source bytes remain in the immutable package; they are not copied into `runs.task` or ordinary activity messages. Run APIs expose the selected package binding for provenance.

Queue recovery reconstructs the prompt from the durable task/package references and rechecks the current review. Revocation blocks a not-yet-started use. It cannot retract text already delivered to a running provider and does not automatically kill that process or rewrite result acceptance. A caller retrying the same already accepted dispatch keeps the original run identity; it does not authorize a second execution.

## Evidence and limits

- `contextDispatch.test.ts` verifies exact approval/digest/base matching, immutable bindings, combined byte limits, secret rechecking, and a real disk-profile reopen where revoked queued context fails before any writer lock, workspace or provider invocation.
- `taskExecutionApi.test.ts` creates and reviews an actual committed source package through the production API. An isolated real local child adapter receives the source text and digest; the binding persists through completion and server restart, while ordinary run task text remains free of the source-file copy. This is an offline adapter, not a live model.
- `taskReviewMigration.test.ts` creates the pre-context schema using its actual columns and verifies unchanged historical task/verification data plus null new context fields after migration.

`npm run verify` passed type checking, lint, 436 tests in 98 files and builds on Windows x64 / Node 22.18.0. Source/log hashes are in `context-dispatch-evidence.json`; logs are `controlos-context-dispatch-focused.log` and `controlos-context-dispatch-verify.log`.

This integration does not prove prompt-injection resistance, an OS sandbox, provider tool/resource boundaries or live model acceptance. The review UI is now implemented with separate evidence in [context-packages-ui.md](context-packages-ui.md); separately approved instruction roles and handoff provenance remain open. Native installer/upgrade/restore acceptance for schema 0023 also remains open. T10/T11 and full R1–R4 gates are not marked passed by these narrower checks.
