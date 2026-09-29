# Base for new work follows the verified default branch (T02)

Inspection: nothing hard-coded `main`, and the GitHub default branch was read
with exact case, but the base for a task run was simply the registered
checkout's current commit. A checkout left on a feature branch or behind the
default branch started task work from that commit without comment, and the
default branch's head commit was never stored.

Now:

- Each GitHub sync records, per repository (by numeric id), the head commit of
  the exact default branch it read, with the check time. A head for another
  spelling (e.g. `main` when the default is `Main`) is ignored. Renaming the
  default branch clears the verified head until the next read.
- `dispatchTask` requires the base to equal that verified head for GitHub
  repositories. Otherwise it refuses with the branch name and both commits,
  unless the request carries `nonDefaultBase: true`. If GitHub has not yet
  verified the default branch, it refuses with that reason. Idempotent retries
  of an accepted run are not re-checked.
- The run review in Tasks shows "Base is the head of the default branch
  '<name>'", or the mismatch/unverified reason with a "Start from this commit
  anyway" checkbox that must be ticked to start.
- Local-only repositories have no API to verify against; the review says so and
  the base remains the checkout's reviewed commit.

Evidence: `registry.test.ts` (real Git checkout on `feature`, default `Main`:
unverified refusal, wrong-case head ignored, mismatch refusal naming both
commits, explicit override, exact match accepted, resync preserves the head,
branch rename clears it) and `github.test.ts` (sync reports `9`, `Main` and the
head it read). `scripts/verify.sh` 499 tests and `npm run smoke` passed.

Limits: the verified head is as of the last sync (up to a few minutes old);
the check does not fetch or move the working copy. Plain (non-task) dispatch
and auto-review still use the checkout's current commit. Full T02 remains open.
