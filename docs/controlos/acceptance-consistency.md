# Result acceptance consistency

For versioned runs, the outcome endpoint delegates acceptance to the verifier.
The submitted revision and content digest must match a completed run with passed
verification. The current worktree is then hashed independently. A mismatch or
unreadable worktree clears the old verdict and acceptance rather than leaving a
green result behind. Starting a new verification also clears them before its
preflight checks, including when those checks fail.

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
General immutable operation approvals tied to policy versions remain separate
work. The full T26 scenario remains not_run; local regression evidence alone
does not certify the complete approval system.
