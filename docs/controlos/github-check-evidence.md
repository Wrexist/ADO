# GitHub PR check evidence

Inspection for T18 found that the built-in Octokit adapter only reads remote
objects. It does not create PRs, issues, releases or workflow dispatches. Agent
tools can have external effects outside this adapter, and still lack the stable
remote-operation journal and unknown-outcome reconciliation required by T18.
Read-only adapter behavior is not acceptance evidence for that requirement.

The inspection also found a false-green result in the existing PR detail read:
the first 50 checks were considered passing unless one of three failure labels
was present. Missing, unfamiliar, neutral and skipped conclusions could fall
through to green, and a truncated response could omit a failed check.

The adapter now requires unique positive check IDs and matching PR-head revisions.
A passing summary additionally requires `total_count` to equal the received row
count and every check to be completed with `success`. Known in-progress statuses
remain pending, and observed explicit failures remain failing even on a partial
page. Unknown terminal results, mismatched identities and incomplete all-success
pages remain unknown. This endpoint still reads one bounded page; it does not
claim to enumerate all checks for large PRs. Neutral/skipped checks are deliberately
not reported as executed successes.

This is an observed-check summary, not branch-protection evaluation, all required
status contexts, or merge authorization. The API distinction between check
status/conclusion and the paginated list is documented in the
[GitHub Checks REST API](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference).

`checks.test.ts` runs the real Octokit adapter with injected HTTP transport. It
covers complete success, partial pages, absent/future/neutral/skipped conclusions,
revision mismatch, duplicate identity, pending and explicit failure. No live
GitHub token, external write, provider run or pilot change is used.

Validation on Windows/Node 22.18.0: the initial 12 adapter cases passed; the final
full `npm run verify` also includes wrong-revision failure and duplicate-identity
cases and passed typecheck, lint, 466 tests in 102 files and build. Logs:
`controlos-pr-checks-focused.log` and `controlos-pr-checks-verify.log`. Vite's
existing chunk-size warning remains. PR heads can change after these reads;
this status must not be reused as execution authorization.

## Consistent PR revision reads

The adapter now establishes the open PR's number, head SHA and base SHA from a
fresh detail read before checking that head. It requires the head to agree with
the PR-list result. A final uncached detail read after the check request must
still match both revisions and the open PR identity. Only that final response
can supply mergeability. Head/base movement, closure, mismatched number, missing
identity or an unavailable final read clears both check and mergeability results.
If the initial identity cannot be established, no check request is issued.

The adapter tests cover head changes before and after checks, base changes,
closure, mismatched PR number and unavailable initial/final reads. The existing
check-result matrix remains a positive control for stable PR identity. This adds
one bounded detail read, not an automatic retry. It cannot make several GitHub
reads an atomic snapshot or prevent a change immediately after the final read;
these remain observations, never permission to merge.

Verification (2026-09-29): focused GitHub adapter tests 35/35; `scripts/verify.sh`
passed typecheck, lint, 473 tests in 102 files and build.
