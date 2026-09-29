# GitHub repository identity (T01)

The project registry already keyed GitHub repositories by numeric id. The
dashboard sync did not: a GitHub-only repository's entry id was derived from
`owner/name`, and local checkouts were matched by name alone. After a rename
plus reuse of the old name by a different repository, the new repository
inherited the old entry and its builds, releases and CI failures. A rename also
never updated the entry, because the base event id did not include the name.

Now each synced repository carries `githubRepoId` (GitHub's numeric id):

- An existing entry with the same `githubRepoId` is reused, so a rename updates
  that entry's name instead of creating or hijacking another.
- A local checkout matched by name is only used when it has no recorded id or
  the same id; a different repository reusing the name gets its own entry.
- New GitHub-only entries use `github-<numeric id>`. A pre-upgrade name-keyed
  entry is adopted once (and stamped with the id) so existing history stays.

Evidence: `github.test.ts` "keys GitHub repositories by numeric id across
renames and reused names" (builds of repo 1 stay on repo 1 after repo 2 takes
its old name) and "adopts a legacy name-keyed entry once, without moving a
local checkout to a reused name". `scripts/verify.sh`: 487 tests passed.

Limits: a local checkout whose `origin` still uses a pre-rename name is not
linked to the renamed GitHub entry (it stays separate rather than merging).
Scanner ids of removed folders can be reused by a new folder with the same
slug; dispatch still verifies path and Git identity. Full T01 remains open.
