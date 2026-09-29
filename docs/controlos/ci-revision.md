# CI result bound to the current branch head (T03)

Inspection found that repository-level CI reached the project cards as
`{label, pct, state}` only. The newest Actions run's commit SHA and start time
were dropped, and nothing compared the run with the branch head. Immediately
after a push, before GitHub starts a run for the new commit, the previous
commit's green run rendered as a green check and as "Passing" in Ops.

The GitHub sync now reads the default-branch head (`repos.getBranch`, exact
branch name, ETag-cached) alongside the latest run. `RepoCI` carries the run's
`headSha`, `runTs` and the observed `branchHeadSha`; malformed values are
dropped rather than guessed. `ciRevision()` classifies a result as:

- `current`: run SHA equals the branch head read with it. Only this may render
  the success/failure tone, check icon or "Passing".
- `older`: both SHAs are known and differ. Cards and the project page show
  `Run for <sha7> · <age> · not head <sha7> (<state>)` with a muted bar; Ops
  shows "Older commit <sha7>".
- `unverified`: either SHA is missing (unreadable head, legacy events without a
  SHA). Rendered muted as "unverified", never as a check.

Because the SHAs are part of the stored `ci`, a new head re-emits
`repo.enriched` even when the run's state is unchanged, and legacy persisted
events replay as unverified instead of green.

Evidence: `apps/server/src/integrations/github/ciRevision.test.ts` (mapper,
push-before-run sync sequence with exact `Main` branch name, unreadable head
marking GitHub degraded, adapter branch/SHA validation) and
`apps/web/src/lib/ci.test.ts` (display and Ops status for current, older and
unverified results). The demo seed marks its fixture runs as current, so the
canonical `/command` and `/ops` screenshots are unchanged.

Limits: the comparison is against the GitHub default branch, not a local
checkout with unpushed commits or another checked-out branch. Two reads are not
an atomic snapshot; a push right after the head read is caught on the next
sync. Full T03 acceptance remains open.

Verification (2026-09-29): focused tests 83/83; `scripts/verify.sh` passed
typecheck, lint, 479 tests in 104 files and build; `npm run smoke` passed.

Rendered probe: `node --import tsx scripts/probe-ci-revision.mts` publishes
synthetic CI events through the production server and the built renderer. The
older green run shows SHA and age on Repositories, the project page and the
390 px overview; Ops shows "Older commit" and no "Passing"; a matching run
renders "Passing" as positive control. No page errors or horizontal overflow.
Record: `ci-revision-evidence.json`; images `smoke-shots/ci-revision-*.png`.
